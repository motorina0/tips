;(function () {
  function createLNbitsExtensionClient({extensionId}) {
    const baseUrl = `/api/v1/ext/${extensionId}`

    return {
      context() {
        return bridgeRequest({action: 'context'})
      },

      notifyError(message) {
        return bridgeRequest({
          action: 'ui.notify',
          level: 'negative',
          message: errorMessage(message)
        })
      },

      createJar(payload) {
        return request(`${baseUrl}/jars`, {
          method: 'POST',
          body: payload
        })
      },

      listJars() {
        return request(`${baseUrl}/jars`)
      },

      getPublicJar(jarId) {
        return request(`${baseUrl}/jars/${encodeURIComponent(jarId)}`)
      },

      createInvoice(payload) {
        return request(`${baseUrl}/invoice`, {
          method: 'POST',
          body: payload
        })
      }
    }
  }

  function request(path, {method = 'GET', body = null} = {}) {
    return bridgeRequest({
      action: 'api',
      method,
      path,
      body
    }).then(unwrapRuntimeResponse)
  }

  function bridgeRequest(message) {
    if (window.parent === window) {
      return Promise.reject(new Error('LNbits extension bridge is not available.'))
    }

    const id =
      window.crypto?.randomUUID?.() ||
      `request_${Date.now()}_${Math.random().toString(36).slice(2)}`

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onMessage)
        reject(new Error('LNbits extension bridge timed out.'))
      }, 30000)

      function onMessage(event) {
        const response = event.data
        if (
          !response ||
          response.type !== 'lnbits-extension:response' ||
          response.id !== id
        ) {
          return
        }

        window.clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
        if (response.ok === false) {
          reject(new Error(response.error || 'Extension call failed.'))
          return
        }
        resolve(response.data)
      }

      window.addEventListener('message', onMessage)
      window.parent.postMessage(
        {
          type: 'lnbits-extension:request',
          id,
          ...message
        },
        '*'
      )
    })
  }

  function unwrapRuntimeResponse(value) {
    if (typeof value === 'string') {
      value = JSON.parse(value)
    }

    if (value && value.ok === false) {
      throw new Error(value.error || 'Extension call failed.')
    }

    if (value && value.ok === true && 'data' in value) {
      return value.data
    }

    return value
  }

  function errorMessage(value) {
    return value instanceof Error ? value.message : String(value)
  }

  window.createLNbitsExtensionClient = createLNbitsExtensionClient
})()
