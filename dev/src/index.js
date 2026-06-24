import {payments, storage, system, wallet} from './lnbits-sdk.js'

const TAG = 'tips'
const JAR_PREFIX = 'public:jar:'
const JAR_WALLET_PREFIX = 'secret:jar-wallet:'
const TIP_PUBLIC_PREFIX = 'public:tip:'
const TIP_PRIVATE_PREFIX = 'private:tip:'

export function createTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const id = cleanId(request.id) || system.id('tipjar')
    const title = cleanText(request.title, 80) || 'Tip jar'
    const description = cleanText(request.description, 280)
    const walletId = requiredText(request.walletId, 'walletId', 128)
    const thankYouMessage =
      cleanText(request.thankYouMessage, 160) || 'Thanks for the tip.'
    const suggestedAmounts = normalizeAmounts(request.suggestedAmounts)
    const timestamp = system.now()

    const jar = {
      id,
      title,
      description,
      slug: cleanSlug(request.slug) || id,
      suggestedAmounts,
      thankYouMessage,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    storage.set(`${JAR_PREFIX}${id}`, jar)
    storage.setText(`${JAR_WALLET_PREFIX}${id}`, walletId)
    system.log(`tips: created jar ${id}`)
    return jar
  })
}

export function listTipJars(_requestJson) {
  return runJson(() => {
    const jars = storage
      .listValues(JAR_PREFIX)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return {jars}
  })
}

export function listTipWallets(_requestJson) {
  return runJson(() => {
    return {wallets: wallet.listUserWallets()}
  })
}

export function getPublicTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getJar(jarId)
    const tips = listPublicTips(jarId)
    return {jar, tips}
  })
}

export function createTipInvoice(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getJar(jarId)
    const walletId = requiredStoredValue(`${JAR_WALLET_PREFIX}${jarId}`)
    const amountSat = normalizeAmount(request.amountSat)
    const name = cleanText(request.name, 60) || 'Anonymous'
    const message = cleanText(request.message, 280)
    const tipId = system.id('tip')
    const memo = message ? `${jar.title}: ${message}` : jar.title

    const invoice = wallet.createInvoice({
        walletId,
        amountSat,
        memo,
        tag: TAG,
        extra: {
          tip_id: tipId,
          jar_id: jarId
        }
      })

    const timestamp = system.now()
    const tip = {
      id: tipId,
      jarId,
      amountSat,
      name,
      message,
      paymentHash: invoice.paymentHash,
      paid: false,
      createdAt: timestamp,
      paidAt: null
    }

    storage.set(`${TIP_PRIVATE_PREFIX}${tipId}`, tip)
    storage.set(`${TIP_PUBLIC_PREFIX}${tipId}`, publicTip(tip))
    payments.watch(invoice.paymentHash, 'record-payment')

    return {
      tipId,
      paymentHash: invoice.paymentHash,
      paymentRequest: invoice.paymentRequest,
      checkingId: invoice.checkingId
    }
  })
}

export function recordPayment(eventJson) {
  return runJson(() => {
    const event = parseJsonObject(eventJson)
    const paymentHash = requiredText(event.paymentHash, 'paymentHash', 128)
    const keys = storage.list(TIP_PRIVATE_PREFIX)
    const timestamp = system.now()

    for (const key of keys) {
      const tip = storage.get(key)
      if (!tip) continue
      if (tip.paymentHash !== paymentHash) continue

      const paidTip = {...tip, paid: true, paidAt: timestamp}
      storage.set(key, paidTip)
      storage.set(`${TIP_PUBLIC_PREFIX}${paidTip.id}`, publicTip(paidTip))
      return {ok: true, tipId: paidTip.id}
    }

    return {ok: false, error: 'payment not found'}
  })
}

function runJson(fn) {
  try {
    return JSON.stringify({ok: true, data: fn()})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    system.log(`tips: ${message}`, 'warning')
    return JSON.stringify({ok: false, error: message})
  }
}

function parseJsonObject(value) {
  if (!value) return {}
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.')
  }
  return parsed
}

function getJar(jarId) {
  const jar = storage.get(`${JAR_PREFIX}${jarId}`)
  if (!jar) throw new Error('Tip jar not found.')
  return jar
}

function listPublicTips(jarId) {
  return storage
    .listValues(TIP_PUBLIC_PREFIX)
    .filter(tip => tip.jarId === jarId && tip.paid)
    .sort((a, b) => (b.paidAt || b.createdAt || 0) - (a.paidAt || a.createdAt || 0))
}

function publicTip(tip) {
  return {
    id: tip.id,
    jarId: tip.jarId,
    amountSat: tip.amountSat,
    name: tip.name,
    message: tip.message,
    paid: tip.paid,
    createdAt: tip.createdAt,
    paidAt: tip.paidAt
  }
}

function normalizeAmounts(value) {
  const amounts = Array.isArray(value) ? value : [100, 500, 1000]
  const clean = amounts
    .map(amount => Number(amount))
    .filter(amount => Number.isInteger(amount) && amount > 0 && amount <= 10000000)
  return clean.length ? [...new Set(clean)].slice(0, 6) : [100, 500, 1000]
}

function normalizeAmount(value) {
  const amount = Number(value)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountSat must be a positive integer.')
  }
  if (amount > 10000000) {
    throw new Error('amountSat exceeds the extension limit.')
  }
  return amount
}

function cleanId(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}

function cleanSlug(value) {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function requiredText(value, field, maxLength) {
  const text = cleanText(value, maxLength)
  if (!text) throw new Error(`${field} is required.`)
  return text
}

function requiredStoredValue(key) {
  const value = storage.getText(key)
  if (!value) throw new Error(`Missing stored value for ${key}.`)
  return value
}
