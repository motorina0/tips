const state = {
  jarId: null
}

const client = window.createLNbitsExtensionClient({
  extensionId: 'tips'
})

const tipForm = document.querySelector('#tip-form')
const createInvoiceButton = document.querySelector('#create-invoice-button')
const publicPage = document.querySelector('#public-page')
const result = document.querySelector('#result')
const runtimeStatus = document.querySelector('#runtime-status')
runtimeStatus.textContent = 'sandbox bridge'

createInvoiceButton.addEventListener('click', async event => {
  event.preventDefault()
  try {
    const payload = {
      jarId: state.jarId,
      amountSat: Number(fieldValue(tipForm, 'amountSat')),
      name: fieldValue(tipForm, 'name'),
      message: fieldValue(tipForm, 'message')
    }

    const invoice = await client.createInvoice(payload)
    showResult(invoice)
  } catch (error) {
    showError(error)
  }
})

init().catch(showError)

async function init() {
  const context = await client.context()
  state.jarId = context.routeParams?.jarId || null
  await renderPublicPage()
}

async function renderPublicPage() {
  if (!state.jarId) {
    publicPage.innerHTML = '<p class="muted">No tip jar selected.</p>'
    tipForm.hidden = true
    return
  }

  const response = await client.getPublicJar(state.jarId)
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

function showResult(value) {
  result.textContent = JSON.stringify(value, null, 2)
}

function fieldValue(container, name) {
  return String(container.querySelector(`[name="${name}"]`)?.value || '')
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  result.textContent = JSON.stringify({error: message}, null, 2)
  client.notifyError(message).catch(() => {})
}
