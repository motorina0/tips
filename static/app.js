import {createLNbitsExtensionClient} from './lnbits-extension-sdk.js'

const state = {
  jars: [],
  activeJarId: null
}

const client = createLNbitsExtensionClient({
  extensionId: 'tips'
})

const jarForm = document.querySelector('#jar-form')
const tipForm = document.querySelector('#tip-form')
const jarSelect = document.querySelector('#jar-select')
const publicPage = document.querySelector('#public-page')
const result = document.querySelector('#result')
const runtimeStatus = document.querySelector('#runtime-status')
runtimeStatus.textContent = 'wasm runtime'

jarForm.addEventListener('submit', async event => {
  event.preventDefault()
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
  showResult(jar)
})

tipForm.addEventListener('submit', async event => {
  event.preventDefault()
  const form = new FormData(tipForm)
  const payload = {
    jarId: state.activeJarId,
    amountSat: Number(form.get('amountSat')),
    name: form.get('name'),
    message: form.get('message')
  }

  const invoice = await client.createInvoice(payload)
  showResult(invoice)
})

jarSelect.addEventListener('change', async event => {
  state.activeJarId = event.target.value
  await renderPublicPage()
})

await refreshJars()

async function refreshJars() {
  const response = await client.listJars()
  state.jars = response.jars || []

  if (!state.activeJarId && state.jars.length) {
    state.activeJarId = state.jars[0].id
  }

  jarSelect.innerHTML = ''
  for (const jar of state.jars) {
    const option = document.createElement('option')
    option.value = jar.id
    option.textContent = jar.title
    option.selected = jar.id === state.activeJarId
    jarSelect.append(option)
  }

  await renderPublicPage()
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

function showResult(value) {
  result.textContent = JSON.stringify(value, null, 2)
}
