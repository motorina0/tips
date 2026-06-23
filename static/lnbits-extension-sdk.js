export function createLNbitsExtensionClient({extensionId}) {
  const baseUrl = `/api/v1/ext/${extensionId}`

  return {
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

async function request(url, {method = 'GET', body = null} = {}) {
  const options = {method, headers: {}}
  if (body) {
    options.headers['content-type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  if (!response.ok) throw new Error(await response.text())
  return unwrapRuntimeResponse(await response.json())
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
