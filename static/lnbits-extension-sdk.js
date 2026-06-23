export function createLNbitsExtensionClient({extensionId}) {
  return {
    async invoke(functionName, payload = {}) {
      if (window.LNbitsExtension?.invoke) {
        return unwrapRuntimeResponse(
          await window.LNbitsExtension.invoke(functionName, payload)
        )
      }

      const response = await fetch(
        `/api/v1/extensions/${extensionId}/invoke/${functionName}`,
        {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(payload)
        }
      )
      if (!response.ok) throw new Error(await response.text())
      return unwrapRuntimeResponse(await response.json())
    }
  }
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
