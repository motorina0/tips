import {createLNbitsExtensionClient} from './lnbits-extension-sdk.js'

const state = {
  jars: [],
  activeJarId: null
}

const client = createLNbitsExtensionClient({
  extensionId: 'tips',
  mockInvoke
})

const jarForm = document.querySelector('#jar-form')
const tipForm = document.querySelector('#tip-form')
const jarSelect = document.querySelector('#jar-select')
const publicPage = document.querySelector('#public-page')
const result = document.querySelector('#result')
const runtimeStatus = document.querySelector('#runtime-status')

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

  const jar = await client.invoke('create-tip-jar', payload)
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

  const invoice = await client.invoke('create-tip-invoice', payload)
  showResult(invoice)
})

jarSelect.addEventListener('change', async event => {
  state.activeJarId = event.target.value
  await renderPublicPage()
})

await refreshJars()

async function refreshJars() {
  const response = await client.invoke('list-tip-jars', {})
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

  const response = await client.invoke('get-public-tip-jar', {
    jarId: state.activeJarId
  })
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

function mockInvoke(functionName, payload) {
  runtimeStatus.textContent = 'mock runtime'
  const jars = readMock('tips:jars', [])
  const tips = readMock('tips:tips', [])

  if (functionName === 'create-tip-jar') {
    const now = Date.now()
    const jar = {
      id: `tipjar_${Math.random().toString(36).slice(2, 10)}`,
      title: payload.title || 'Tip jar',
      description: payload.description || '',
      slug: '',
      suggestedAmounts: payload.suggestedAmounts?.length
        ? payload.suggestedAmounts
        : [100, 500, 1000],
      thankYouMessage: payload.thankYouMessage || 'Thanks for the tip.',
      createdAt: now,
      updatedAt: now
    }
    writeMock('tips:jars', [jar, ...jars])
    return jar
  }

  if (functionName === 'list-tip-jars') {
    return {jars}
  }

  if (functionName === 'get-public-tip-jar') {
    return {
      jar: jars.find(jar => jar.id === payload.jarId) || jars[0],
      tips: tips.filter(tip => tip.jarId === payload.jarId && tip.paid)
    }
  }

  if (functionName === 'create-tip-invoice') {
    const tip = {
      id: `tip_${Math.random().toString(36).slice(2, 10)}`,
      jarId: payload.jarId,
      amountSat: payload.amountSat,
      name: payload.name || 'Anonymous',
      message: payload.message || '',
      paymentHash: `mock_hash_${Date.now()}`,
      paid: false,
      createdAt: Date.now(),
      paidAt: null
    }
    writeMock('tips:tips', [tip, ...tips])
    return {
      tipId: tip.id,
      paymentHash: tip.paymentHash,
      paymentRequest: `lnbc${payload.amountSat}n1mockinvoice`,
      checkingId: `mock_check_${tip.id}`
    }
  }

  throw new Error(`Unknown function: ${functionName}`)
}

function readMock(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback
  } catch (_error) {
    return fallback
  }
}

function writeMock(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function showResult(value) {
  result.textContent = JSON.stringify(value, null, 2)
}
