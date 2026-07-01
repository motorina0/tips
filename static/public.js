const state = {
  invoiceUnsubscribe: null,
  jarId: null,
  qrApp: null
}

const client = window.createLNbitsExtensionClient({
  extensionId: 'tips'
})

const tipForm = document.querySelector('#tip-form')
const createInvoiceButton = document.querySelector('#create-invoice-button')
const publicPage = document.querySelector('#public-page')
const runtimeStatus = document.querySelector('#runtime-status')
const invoiceDialog = document.querySelector('#invoice-dialog')
const invoiceQrCode = document.querySelector('#invoice-qrcode')
const invoiceStatus = document.querySelector('#invoice-status')
const copyInvoiceButton = document.querySelector('#copy-invoice-button')
const confettiLayer = document.querySelector('#confetti-layer')
runtimeStatus.textContent = 'sandbox bridge'

createInvoiceButton.addEventListener('click', async event => {
  event.preventDefault()
  setInvoiceLoading(true)
  try {
    const payload = {
      jarId: state.jarId,
      amount: Number(fieldValue(tipForm, 'amount')),
      currency: 'sat',
      name: fieldValue(tipForm, 'name'),
      message: fieldValue(tipForm, 'message')
    }

    const invoice = await client.createInvoice(payload)
    openInvoiceDialog(invoice)
    await subscribeToPayment(invoice.paymentHash)
  } catch (error) {
    showError(error)
  } finally {
    setInvoiceLoading(false)
  }
})

copyInvoiceButton.addEventListener('click', () => {
  const invoice = copyInvoiceButton.dataset.invoice || ''
  if (!invoice) return
  navigator.clipboard?.writeText(invoice).catch(() => {})
})

for (const closeControl of document.querySelectorAll('[data-close-invoice]')) {
  closeControl.addEventListener('click', closeInvoiceDialog)
}

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
      tipForm.elements.amount.value = amount
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

function setInvoiceLoading(loading) {
  createInvoiceButton.disabled = loading
  createInvoiceButton.setAttribute('aria-busy', loading ? 'true' : 'false')
}

function openInvoiceDialog(invoice) {
  if (!invoice?.paymentRequest || !invoice?.paymentHash) {
    throw new Error('Invalid invoice response.')
  }

  const paymentRequest = invoice.paymentRequest
  const qrValue = `lightning:${paymentRequest.toUpperCase()}`
  invoiceStatus.textContent = 'Waiting for payment'
  invoiceStatus.classList.remove('text-positive')
  copyInvoiceButton.dataset.invoice = paymentRequest
  renderQrCode(qrValue)
  invoiceDialog.hidden = false
}

function closeInvoiceDialog() {
  invoiceDialog.hidden = true
  cleanupPaymentSubscription()
  if (state.qrApp) {
    state.qrApp.unmount()
    state.qrApp = null
  }
  invoiceQrCode.innerHTML = ''
  confettiLayer.innerHTML = ''
}

function renderQrCode(value) {
  if (!window.Vue || !window.QrcodeVue?.default) {
    throw new Error('QR code renderer is not available.')
  }

  if (state.qrApp) {
    state.qrApp.unmount()
  }
  invoiceQrCode.innerHTML = ''
  state.qrApp = window.Vue.createApp({
    render() {
      return window.Vue.h(window.QrcodeVue.default, {
        value,
        size: 280,
        margin: 3,
        level: 'Q',
        renderAs: 'svg',
        class: 'invoice-qrcode-svg'
      })
    }
  })
  state.qrApp.mount(invoiceQrCode)
}

async function subscribeToPayment(paymentHash) {
  cleanupPaymentSubscription()
  state.invoiceUnsubscribe = await client.subscribePayment(paymentHash, event => {
    if (event.event === 'payment.error') {
      invoiceStatus.textContent = 'Payment listener disconnected'
      return
    }

    const payment = event.data || {}
    if (
      event.event === 'payment.settled' ||
      payment.pending === false ||
      ['success', 'settled', 'paid'].includes(String(payment.status || ''))
    ) {
      handleInvoicePaid()
    }
  })
}

function cleanupPaymentSubscription() {
  if (!state.invoiceUnsubscribe) return
  state.invoiceUnsubscribe()
  state.invoiceUnsubscribe = null
}

function handleInvoicePaid() {
  cleanupPaymentSubscription()
  invoiceStatus.textContent = 'Payment received'
  invoiceStatus.classList.add('text-positive')
  showConfetti()
  window.setTimeout(() => {
    closeInvoiceDialog()
    renderPublicPage().catch(showError)
  }, 1600)
}

function showConfetti() {
  confettiLayer.innerHTML = ''
  for (let index = 1; index <= 32; index += 1) {
    const piece = document.createElement('span')
    piece.className = `confetti-piece confetti-piece-${index}`
    confettiLayer.append(piece)
  }
  window.setTimeout(() => {
    confettiLayer.innerHTML = ''
  }, 1800)
}

function fieldValue(container, name) {
  return String(container.querySelector(`[name="${name}"]`)?.value || '')
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  client.notifyError(message).catch(() => {})
}
