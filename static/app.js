const state = {
  jars: [],
  activeJarId: null,
  publicMode: false
}

const client = window.createLNbitsExtensionClient({
  extensionId: 'tips'
})

const privateView = document.querySelector('#private-view')
const publicView = document.querySelector('#public-view')
const jarForm = document.querySelector('#jar-form')
const tipForm = document.querySelector('#tip-form')
const jarList = document.querySelector('#jar-list')
const publicPage = document.querySelector('#public-page')
const result = document.querySelector('#result')
const runtimeStatus = document.querySelector('#runtime-status')
runtimeStatus.textContent = 'sandbox bridge'

jarForm.addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const form = new FormData(jarForm)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      walletId: form.get('walletId'),
      suggestedAmounts: String(form.get('suggestedAmounts') || '')
        .split(',')
        .map(value => Number(value.trim()))
        .filter(Boolean),
      thankYouMessage: form.get('thankYouMessage')
    }

    const jar = await client.createJar(payload)
    state.activeJarId = jar.id
    await refreshJars()
    showResult({
      jar,
      publicUrl: publicJarUrl(jar.id)
    })
  } catch (error) {
    showError(error)
  }
})

tipForm.addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const form = new FormData(tipForm)
    const payload = {
      jarId: state.activeJarId,
      amountSat: Number(form.get('amountSat')),
      name: form.get('name'),
      message: form.get('message')
    }

    const invoice = await client.createInvoice(payload)
    showResult(invoice)
  } catch (error) {
    showError(error)
  }
})

init()

async function init() {
  try {
    const context = await client.context()
    state.publicMode = Boolean(context.public)
    state.activeJarId = context.routeParams?.jarId || null

    if (state.publicMode) {
      privateView.hidden = true
      publicView.hidden = false
      await renderPublicPage()
      return
    }

    privateView.hidden = false
    publicView.hidden = true
    await refreshJars()
  } catch (error) {
    showError(error)
  }
}

async function refreshJars() {
  if (state.publicMode) return

  const response = await client.listJars()
  state.jars = response.jars || []

  if (!state.activeJarId && state.jars.length) {
    state.activeJarId = state.jars[0].id
  }

  renderJarList()
}

function renderJarList() {
  jarList.innerHTML = ''
  if (!state.jars.length) {
    jarList.innerHTML = '<p class="muted q-my-none">No jars yet.</p>'
    return
  }

  for (const jar of state.jars) {
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

async function renderPublicPage() {
  if (!state.activeJarId) {
    publicPage.innerHTML = '<p class="muted">No tip jar yet.</p>'
    return
  }

  const response = await client.getPublicJar(state.activeJarId)
  const jar = response.jar
  const tips = response.tips || []

  publicPage.innerHTML = ''
  const title = document.createElement('h2')
  title.className = 'text-h5 text-weight-bold q-mt-none q-mb-sm'
  title.textContent = jar.title
  const description = document.createElement('p')
  description.className = 'muted'
  description.textContent = jar.description || 'Send a Lightning tip.'
  const amounts = document.createElement('div')
  amounts.className = 'amount-row'

  for (const amount of jar.suggestedAmounts || []) {
    const chip = document.createElement('span')
    chip.className = 'amount-chip'
    chip.textContent = `${amount} sats`
    chip.addEventListener('click', () => {
      tipForm.elements.amountSat.value = amount
    })
    amounts.append(chip)
  }

  publicPage.append(title, description, amounts)

  if (tips.length) {
    const recent = document.createElement('p')
    recent.className = 'muted'
    recent.textContent = `${tips.length} paid tip${tips.length === 1 ? '' : 's'}`
    publicPage.append(recent)
  }
}

function publicJarUrl(jarId) {
  return new URL(
    `/ext/tips/jars/${encodeURIComponent(jarId)}`,
    window.location.href
  ).href
}

async function copyPublicUrl(url) {
  try {
    await navigator.clipboard.writeText(url)
    showResult({copied: true, publicUrl: url})
  } catch (error) {
    logFailure('Failed to copy public jar URL.', {url, error})
    showResult({publicUrl: url})
  }
}

function showResult(value) {
  result.textContent = JSON.stringify(value, null, 2)
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  logFailure('Page error.', {message, error})
  result.textContent = JSON.stringify({error: message}, null, 2)
  client.notifyError(message).catch(notifyError => {
    logFailure('Failed to notify page error.', {notifyError})
  })
}

function logFailure(message, details = {}) {
  console.error('[tips app]', message, details)
}
