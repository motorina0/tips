const client = window.createLNbitsExtensionClient({
  extensionId: 'tips'
})

const jarForm = document.querySelector('#jar-form')
const createJarButton = document.querySelector('#create-jar-button')
const jarList = document.querySelector('#jar-list')
const result = document.querySelector('#result')
const runtimeStatus = document.querySelector('#runtime-status')
runtimeStatus.textContent = 'sandbox bridge'

createJarButton.addEventListener('click', async event => {
  event.preventDefault()
  try {
    const payload = {
      title: fieldValue(jarForm, 'title'),
      description: fieldValue(jarForm, 'description'),
      walletId: fieldValue(jarForm, 'walletId'),
      suggestedAmounts: fieldValue(jarForm, 'suggestedAmounts')
        .split(',')
        .map(value => Number(value.trim()))
        .filter(Boolean),
      thankYouMessage: fieldValue(jarForm, 'thankYouMessage')
    }

    const jar = await client.createJar(payload)
    await refreshJars()
    showResult({
      jar,
      publicUrl: publicJarUrl(jar.id)
    })
  } catch (error) {
    showError(error)
  }
})

refreshJars().catch(showError)

async function refreshJars() {
  const response = await client.listJars()
  renderJarList(response.jars || [])
}

function renderJarList(jars) {
  jarList.innerHTML = ''
  if (!jars.length) {
    jarList.innerHTML = '<p class="muted q-my-none">No jars yet.</p>'
    return
  }

  for (const jar of jars) {
    const row = document.createElement('div')
    row.className = 'jar-row'

    const content = document.createElement('div')
    content.className = 'jar-row-content'

    const title = document.createElement('div')
    title.className = 'text-subtitle1 text-weight-medium'
    title.textContent = jar.title

    const description = document.createElement('div')
    description.className = 'text-caption text-grey-5'
    description.textContent = jar.description || 'No description.'

    const url = document.createElement('input')
    url.className = 'jar-url'
    url.readOnly = true
    url.value = publicJarUrl(jar.id)
    url.addEventListener('focus', () => url.select())

    content.append(title, description, url)

    const actions = document.createElement('div')
    actions.className = 'jar-row-actions'

    const copyButton = document.createElement('button')
    copyButton.className = 'q-btn bg-primary text-white'
    copyButton.type = 'button'
    copyButton.textContent = 'Copy'
    copyButton.addEventListener('click', async () => {
      await copyPublicUrl(url.value)
    })

    actions.append(copyButton)
    row.append(content, actions)
    jarList.append(row)
  }
}

function publicJarUrl(jarId) {
  return new URL(
    `/ext/tips/jars/${encodeURIComponent(jarId)}`,
    window.location.href
  ).href
}

function fieldValue(container, name) {
  return String(container.querySelector(`[name="${name}"]`)?.value || '')
}

async function copyPublicUrl(url) {
  try {
    await navigator.clipboard.writeText(url)
    showResult({copied: true, publicUrl: url})
  } catch (_error) {
    showResult({publicUrl: url})
  }
}

function showResult(value) {
  result.textContent = JSON.stringify(value, null, 2)
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  result.textContent = JSON.stringify({error: message}, null, 2)
  client.notifyError(message).catch(() => {})
}
