;(function () {
  let bridgePortPromise = null

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

      listJars(params = {}) {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null || value === '') continue
          query.set(key, String(value))
        }
        const suffix = query.toString() ? `?${query.toString()}` : ''
        return request(`${baseUrl}/jars${suffix}`)
      },

      listWallets() {
        return request(`${baseUrl}/wallets`)
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

    return getBridgePort().then(port => bridgePortRequest(port, message))
  }

  function getBridgePort() {
    if (!bridgePortPromise) {
      bridgePortPromise = connectBridge()
    }
    return bridgePortPromise
  }

  function connectBridge() {
    const id = requestId()
    const channel = new MessageChannel()
    const parentOrigin = bridgeParentOrigin()

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        channel.port1.removeEventListener('message', onMessage)
        channel.port1.close()
        reject(new Error('LNbits extension bridge timed out.'))
      }, 30000)

      function onMessage(event) {
        if (event.currentTarget !== channel.port1) return

        const response = event.data
        if (
          !response ||
          response.type !== 'lnbits-extension:connected' ||
          response.id !== id
        ) {
          return
        }

        window.clearTimeout(timeout)
        channel.port1.removeEventListener('message', onMessage)
        resolve(channel.port1)
      }

      channel.port1.addEventListener('message', onMessage)
      channel.port1.start()
      window.parent.postMessage(
        {
          type: 'lnbits-extension:connect',
          id
        },
        parentOrigin,
        [channel.port2]
      )
    })
  }

  function bridgePortRequest(port, message) {
    const id = requestId()

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        port.removeEventListener('message', onMessage)
        reject(new Error('LNbits extension bridge timed out.'))
      }, 30000)

      function onMessage(event) {
        if (event.currentTarget !== port) return

        const response = event.data
        if (
          !response ||
          response.type !== 'lnbits-extension:response' ||
          response.id !== id
        ) {
          return
        }

        window.clearTimeout(timeout)
        port.removeEventListener('message', onMessage)
        if (response.ok === false) {
          reject(new Error(response.error || 'Extension call failed.'))
          return
        }
        resolve(response.data)
      }

      port.addEventListener('message', onMessage)
      port.postMessage({
        type: 'lnbits-extension:request',
        id,
        ...message
      })
    })
  }

  function requestId() {
    return (
      window.crypto?.randomUUID?.() ||
      `request_${Date.now()}_${Math.random().toString(36).slice(2)}`
    )
  }

  function bridgeParentOrigin() {
    return new URL(window.location.href).origin
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
