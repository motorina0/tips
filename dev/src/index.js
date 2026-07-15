import {extension, http, storage, system, utils, wallet} from './lnbits-sdk.js'

const JARS_TABLE = 'tip_jars'
const TIPS_TABLE = 'tips'
const MEMPOOL_PRICES_URL = 'https://mempool.space/api/v1/prices'
const MEMPOOL_RATE_CURRENCIES = [
  {currency: 'USD', flag: '🇺🇸'},
  {currency: 'EUR', flag: '🇪🇺'},
  {currency: 'GBP', flag: '🇬🇧'},
  {currency: 'CAD', flag: '🇨🇦'},
  {currency: 'CHF', flag: '🇨🇭'},
  {currency: 'AUD', flag: '🇦🇺'},
  {currency: 'JPY', flag: '🇯🇵'}
]
const JAR_SEARCH_FIELDS = [
  'title',
  'description',
  'wallet_name',
  'watchonly_wallet_name',
  'thank_you_message'
]
const TIP_SEARCH_FIELDS = ['name', 'message', 'payment_hash']
const WATCHONLY_EXTENSION_ID = 'watchonly'

export function createTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const id = cleanId(request.id) || system.id('tipjar')
    const title = cleanText(request.title, 80) || 'Tip jar'
    const description = cleanText(request.description, 280)
    const paymentMethod = normalizePaymentMethod(request.paymentMethod)
    const currency = normalizeCurrency(request.currency)
    const walletId =
      paymentMethod === 'lightning'
        ? requiredText(request.walletId, 'walletId', 128)
        : ''
    const walletName =
      paymentMethod === 'lightning'
        ? cleanText(request.walletName, 120) || walletId
        : ''
    const watchonlyWalletId =
      paymentMethod === 'onchain'
        ? requiredText(request.watchonlyWalletId, 'watchonlyWalletId', 128)
        : ''
    const watchonlyWalletName =
      paymentMethod === 'onchain'
        ? cleanText(request.watchonlyWalletName, 120) || watchonlyWalletId
        : ''
    const onchainAddress =
      paymentMethod === 'onchain' ? freshWatchonlyAddress(watchonlyWalletId) : ''
    const thankYouMessage =
      cleanText(request.thankYouMessage, 160) || 'Thanks for the tip.'
    const suggestedAmounts = normalizeAmounts(request.suggestedAmounts, currency)
    const platformSupport = normalizePlatformSupport(request, paymentMethod)
    const timestamp = system.now()

    const jar = {
      id,
      title,
      description,
      payment_method: paymentMethod,
      currency,
      wallet_id: walletId,
      wallet_name: walletName,
      watchonly_wallet_id: watchonlyWalletId,
      watchonly_wallet_name: watchonlyWalletName,
      onchain_address: onchainAddress,
      slug: cleanSlug(request.slug) || id,
      suggested_amounts: suggestedAmounts,
      thank_you_message: thankYouMessage,
      platform_support_enabled: platformSupport.enabled,
      platform_support_percentage: platformSupport.percentage,
      platform_support_lnurl: platformSupport.lnurl,
      created_at: timestamp,
      updated_at: timestamp
    }

    storage.set(JARS_TABLE, jar)
    system.log(`tips: created jar ${id}`)
    return publicJar(jar)
  })
}

export function updateTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const existing = getJar(jarId)
    const title = cleanText(request.title, 80) || 'Tip jar'
    const description = cleanText(request.description, 280)
    const paymentMethod = normalizePaymentMethod(request.paymentMethod)
    const currency = normalizeCurrency(request.currency)
    const walletId =
      paymentMethod === 'lightning'
        ? requiredText(request.walletId, 'walletId', 128)
        : ''
    const walletName =
      paymentMethod === 'lightning'
        ? cleanText(request.walletName, 120) || walletId
        : ''
    const watchonlyWalletId =
      paymentMethod === 'onchain'
        ? requiredText(request.watchonlyWalletId, 'watchonlyWalletId', 128)
        : ''
    const watchonlyWalletName =
      paymentMethod === 'onchain'
        ? cleanText(request.watchonlyWalletName, 120) || watchonlyWalletId
        : ''
    const onchainAddress =
      paymentMethod === 'onchain'
        ? existing.watchonly_wallet_id === watchonlyWalletId &&
          existing.onchain_address
          ? existing.onchain_address
          : freshWatchonlyAddress(watchonlyWalletId)
        : ''
    const thankYouMessage =
      cleanText(request.thankYouMessage, 160) || 'Thanks for the tip.'
    const suggestedAmounts = normalizeAmounts(request.suggestedAmounts, currency)
    const platformSupport = normalizePlatformSupport(request, paymentMethod)

    const jar = {
      ...existing,
      id: jarId,
      title,
      description,
      payment_method: paymentMethod,
      currency,
      wallet_id: walletId,
      wallet_name: walletName,
      watchonly_wallet_id: watchonlyWalletId,
      watchonly_wallet_name: watchonlyWalletName,
      onchain_address: onchainAddress,
      suggested_amounts: suggestedAmounts,
      thank_you_message: thankYouMessage,
      platform_support_enabled: platformSupport.enabled,
      platform_support_percentage: platformSupport.percentage,
      platform_support_lnurl: platformSupport.lnurl,
      updated_at: system.now()
    }

    storage.set(JARS_TABLE, jar)
    system.log(`tips: updated jar ${jarId}`)
    return publicJar(jar)
  })
}

export function listTipJars(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const rowsPerPage = normalizePageSize(request.rowsPerPage)
    const page = normalizePage(request.page)
    const sortBy = request.sortBy === 'title' ? 'title' : ''
    const response = storage.getPaginated(JARS_TABLE, {
      search: cleanText(request.search, 256),
      searchFields: JAR_SEARCH_FIELDS,
      sortBy,
      descending: request.descending === true || request.descending === 'true',
      limit: rowsPerPage,
      offset: (page - 1) * rowsPerPage
    })

    return {
      jars: response.data.map(publicJar),
      total: response.total
    }
  })
}

export function deleteTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getJar(jarId)
    const paidTips = storage.getPaginated(TIPS_TABLE, {
      filters: {jar_id: jarId, paid: true},
      limit: 1,
      offset: 0
    })

    if (paidTips.total > 0) {
      throw new Error('Tip jars with paid tips cannot be deleted.')
    }

    storage.delete(JARS_TABLE, jarId)
    system.log(`tips: deleted jar ${jarId}`)
    return {id: jar.id, deleted: true}
  })
}

export function listTipJarTips(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getJar(jarId)
    const rowsPerPage = normalizePageSize(request.rowsPerPage)
    const page = normalizePage(request.page)
    const sortBy = normalizeTipSortBy(request.sortBy)
    const response = storage.getPaginated(TIPS_TABLE, {
      filters: {jar_id: jarId},
      search: cleanText(request.search, 256),
      searchFields: TIP_SEARCH_FIELDS,
      sortBy,
      descending: request.descending === true || request.descending === 'true',
      limit: rowsPerPage,
      offset: (page - 1) * rowsPerPage
    })

    return {
      jar: publicJar(jar),
      tips: response.data.map(tip => privateTip(tip, jar)),
      total: response.total
    }
  })
}

export function listTipWallets(_requestJson) {
  return runJson(() => {
    return {wallets: wallet.listUserWallets()}
  })
}

export function listTipWatchonlyWallets(_requestJson) {
  return runJson(() => {
    return {wallets: listWatchonlyWallets()}
  })
}

export function getBitcoinRate(_requestJson) {
  return runJson(() => bitcoinUsdRate())
}

export function listTipCurrencies(_requestJson) {
  return runJson(() => {
    return {currencies: safeCurrencies()}
  })
}

export function getPublicTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getPublicJar(jarId)
    return {
      jar: publicJar(jar),
      tips: [],
      currencies: safeCurrencies(jar.currency)
    }
  })
}

export function createTipInvoice(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getPublicJar(jarId)
    if (jar.paymentMethod === 'onchain') {
      throw new Error('Onchain tip jars do not create Lightning invoices.')
    }
    const currency = normalizeCurrency(request.currency || jar.currency)
    const amount = normalizeAmount(request.amount ?? request.amountSat, currency)
    const name = cleanText(request.name, 60) || 'Anonymous'
    const message = cleanText(request.message, 280)
    const memo = message ? `${jar.title}: ${message}` : jar.title
    const timestamp = system.now()
    const tipId = storage.appendPublic(TIPS_TABLE, jarId, {
      amount_sat: invoiceAmountSat(amount, currency),
      name,
      message,
      payment_hash: '',
      paid: false,
      created_at: timestamp
    })

    const invoice = wallet.createInvoicePublic({
      sourceId: jarId,
      amount,
      currency,
      memo,
      extra: {name, message, tipId}
    })

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
    const paymentHash = eventPaymentHash(event)
    const tipId = eventTipId(event)
    const sourceId = eventSourceId(event)

    if (!paymentHash) {
      throw new Error('paymentHash is required.')
    }

    if (tipId) {
      const tip = storage.get(TIPS_TABLE, tipId)
      if (!tip) {
        return {ok: false, error: 'payment not found'}
      }

      if (tip.payment_hash && tip.payment_hash !== paymentHash) {
        return {ok: false, error: 'payment does not match tip'}
      }

      if (tip.paid) {
        return {ok: true, tipId: tip.id, paid: true, alreadyPaid: true}
      }

      const paidTip = {
        ...tip,
        payment_hash: paymentHash,
        paid: true,
        paid_at: system.now()
      }
      storage.set(TIPS_TABLE, paidTip)
      const jar = getJar(paidTip.jar_id)
      const platformPayment = maybePayPlatformSupport(jar, paidTip)
      system.log(`tips: marked tip ${paidTip.id} as paid`)
      return {ok: true, tipId: paidTip.id, paid: true, platformPayment}
    }

    if (!sourceId) {
      return {ok: false, error: 'payment source not found'}
    }

    const jar = getJar(sourceId)
    const paidTip = paidTipFromEvent(event, sourceId, paymentHash)
    storage.set(TIPS_TABLE, paidTip)
    const platformPayment = maybePayPlatformSupport(jar, paidTip)
    system.log(`tips: recorded paid public tip ${paidTip.id}`)
    return {ok: true, tipId: paidTip.id, paid: true, platformPayment}
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
  const jar = storage.get(JARS_TABLE, jarId)
  if (!jar) throw new Error('Tip jar not found.')
  return jar
}

function getPublicJar(jarId) {
  const jar = storage.getPublic(JARS_TABLE, jarId)
  if (!jar) throw new Error('Tip jar not found.')
  return jar
}

function eventPaymentHash(event) {
  return (
    cleanText(event.paymentHash, 128) ||
    cleanText(event.payment_hash, 128) ||
    cleanText(event.payment?.paymentHash, 128) ||
    cleanText(event.payment?.payment_hash, 128)
  )
}

function eventSourceId(event) {
  return (
    cleanText(event.sourceId, 128) ||
    cleanText(event.source_id, 128) ||
    cleanText(event.extra?.sourceId, 128) ||
    cleanText(event.extra?.source_id, 128) ||
    cleanText(event.payment?.extra?.sourceId, 128) ||
    cleanText(event.payment?.extra?.source_id, 128)
  )
}

function eventTipId(event) {
  const tipExtra = eventExtensionExtra(event)
  return (
    cleanText(event.tipId, 128) ||
    cleanText(event.tip_id, 128) ||
    cleanText(event.extra?.tipId, 128) ||
    cleanText(event.extra?.tip_id, 128) ||
    cleanText(event.payment?.extra?.tipId, 128) ||
    cleanText(event.payment?.extra?.tip_id, 128) ||
    cleanText(tipExtra.tipId, 128) ||
    cleanText(tipExtra.tip_id, 128)
  )
}

function paidTipFromEvent(event, jarId, paymentHash) {
  const timestamp = system.now()
  const tipExtra = eventExtensionExtra(event)
  return {
    id: system.id('tip'),
    jar_id: jarId,
    amount_sat: eventAmountSat(event),
    name: cleanText(tipExtra.name, 60) || 'Anonymous',
    message: cleanText(tipExtra.message, 280),
    payment_hash: paymentHash,
    paid: true,
    created_at: timestamp,
    paid_at: timestamp
  }
}

function maybePayPlatformSupport(jar, tip) {
  const support = platformSupportFromJar(jar)
  if (!support.enabled) return {paid: false, skipped: 'disabled'}
  if ((jar.payment_method || 'lightning') !== 'lightning') {
    return {paid: false, skipped: 'not a Lightning jar'}
  }
  if (!jar.wallet_id) return {paid: false, skipped: 'missing wallet'}

  const tipAmount = Number(tip.amount_sat || 0)
  const amount = Math.floor((tipAmount * support.percentage) / 100)
  if (!Number.isInteger(amount) || amount <= 0) {
    return {paid: false, skipped: 'amount too small'}
  }

  try {
    const payment = wallet.payLnurl({
      walletId: jar.wallet_id,
      lnurl: support.lnurl,
      amount,
      currency: 'sat',
      comment: `Platform support from ${cleanText(jar.title, 80) || 'tip jar'}`,
      description: `Platform support from ${cleanText(jar.title, 80) || 'tip jar'}`,
      maxSat: amount,
      extra: {
        jarId: jar.id,
        tipId: tip.id,
        platformSupport: 'true'
      }
    })

    if (payment && payment.ok === false) {
      throw new Error(payment.error || 'Platform support payment failed.')
    }

    system.log(
      `tips: sent ${amount} sats platform support for tip ${tip.id}`
    )
    return {
      paid: true,
      amountSat: amount,
      paymentHash: payment?.paymentHash || payment?.payment_hash || '',
      checkingId: payment?.checkingId || payment?.checking_id || ''
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    system.log(
      `tips: platform support payment failed for tip ${tip.id}: ${message}`,
      'warning'
    )
    return {paid: false, error: message}
  }
}

function platformSupportFromJar(jar) {
  const percentage = Number(jar.platform_support_percentage || 0)
  return {
    enabled: jar.platform_support_enabled === true,
    percentage: Number.isInteger(percentage) ? percentage : 0,
    lnurl: cleanText(jar.platform_support_lnurl, 2048)
  }
}

function eventExtensionExtra(event) {
  return (
    objectValue(event.extra?.extra_tips) ||
    objectValue(event.payment?.extra?.extra_tips) ||
    {}
  )
}

function eventAmountSat(event) {
  const amount = Number(event.amount || event.payment?.amount || 0)
  return Number.isFinite(amount) ? Math.abs(Math.trunc(amount / 1000)) : 0
}

function invoiceAmountSat(amount, currency) {
  if (currency === 'sat') return Math.trunc(amount)
  const amountSat = utils.currencies.fiatToSats(amount, currency)
  if (!Number.isInteger(amountSat) || amountSat <= 0) {
    throw new Error('amount must convert to at least one sat.')
  }
  return amountSat
}

function bitcoinUsdRate() {
  const {rate, price} = utils.currencies.rate('USD')
  const btcUsd = Number(price)
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) {
    throw new Error('LNbits returned an invalid Bitcoin price.')
  }

  const external = safeMempoolBitcoinRates()

  return {
    source: 'LNbits',
    currency: 'USD',
    btcUsd,
    satsPerUsd: Math.round(Number(rate) || 0),
    sampleAmountSat: 1000,
    sampleAmountUsd: satsToUsd(1000, btcUsd),
    fetchedAt: system.now(),
    externalRates: external.rates,
    externalRateError: external.error,
    externalRateSource: 'mempool.space'
  }
}

function safeMempoolBitcoinRates() {
  try {
    return {rates: mempoolBitcoinRates(), error: ''}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    system.log(`tips: mempool rate unavailable: ${message}`, 'warning')
    return {rates: [], error: message}
  }
}

function mempoolBitcoinRates() {
  const response = http.request({
    method: 'GET',
    url: MEMPOOL_PRICES_URL
  })

  if (response.statusCode !== 200) {
    throw new Error(`mempool.space returned HTTP ${response.statusCode}.`)
  }

  const data = parseJsonObject(response.body)
  const fetchedAt = normalizeTimestamp(data.time) || system.now()
  return MEMPOOL_RATE_CURRENCIES.map(({currency, flag}) => {
    const price = Number(data[currency])
    if (!Number.isFinite(price) || price <= 0) return null
    return {
      source: 'mempool.space',
      currency,
      flag,
      price,
      fetchedAt
    }
  }).filter(Boolean)
}

function normalizeTimestamp(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0
  return Math.trunc(timestamp)
}

function listWatchonlyWallets() {
  const response = extension.request({
    extensionId: WATCHONLY_EXTENSION_ID,
    method: 'GET',
    path: '/api/v1/wallet?network=Mainnet'
  })

  if (response.statusCode !== 200) {
    throw new Error(`Watchonly returned HTTP ${response.statusCode}.`)
  }

  const wallets = JSON.parse(response.body || '[]')
  if (!Array.isArray(wallets)) {
    throw new Error('Watchonly returned an invalid wallet list.')
  }
  return wallets.map(wallet => ({
    id: cleanText(wallet.id, 128),
    title: cleanText(wallet.title, 120) || cleanText(wallet.id, 128),
    balance: Number(wallet.balance || 0),
    network: cleanText(wallet.network, 32) || 'Mainnet'
  }))
}

function freshWatchonlyAddress(walletId) {
  const response = extension.request({
    extensionId: WATCHONLY_EXTENSION_ID,
    method: 'GET',
    path: `/api/v1/address/${encodeURIComponent(walletId)}`
  })

  if (response.statusCode !== 200) {
    throw new Error(`Watchonly returned HTTP ${response.statusCode}.`)
  }

  const address = parseJsonObject(response.body)
  return requiredText(address.address, 'onchain address', 256)
}

function satsToUsd(amountSat, btcUsd) {
  return Number(((Number(amountSat) / 100000000) * btcUsd).toFixed(2))
}

function publicJar(jar) {
  return {
    id: jar.id,
    title: jar.title,
    description: jar.description,
    paymentMethod: jar.payment_method || 'lightning',
    currency: normalizeCurrency(jar.currency || 'sat'),
    walletId: jar.wallet_id || '',
    watchonlyWalletId: jar.watchonly_wallet_id || '',
    walletName:
      jar.payment_method === 'onchain'
        ? jar.watchonly_wallet_name
        : jar.wallet_name,
    onchainAddress: jar.onchain_address || '',
    slug: jar.slug,
    suggestedAmounts: jar.suggested_amounts,
    thankYouMessage: jar.thank_you_message,
    platformSupportMode:
      jar.platform_support_enabled === true ? 'platform' : 'none',
    platformSupportPercentage: Number(jar.platform_support_percentage || 0),
    platformSupportLnurl: jar.platform_support_lnurl || '',
    createdAt: jar.created_at,
    updatedAt: jar.updated_at
  }
}

function publicTip(tip) {
  return {
    id: tip.id,
    jarId: tip.jar_id,
    amountSat: tip.amount_sat,
    name: tip.name,
    message: tip.message,
    paid: tip.paid,
    createdAt: tip.created_at,
    paidAt: tip.paid_at
  }
}

function privateTip(tip, jar) {
  return {
    ...publicTip(tip),
    jarTitle: jar.title,
    paymentHash: tip.payment_hash
  }
}

function normalizeAmounts(value, currency = 'sat') {
  const fallback = currency === 'sat' ? [100, 500, 1000] : [1, 5, 10]
  const amounts = Array.isArray(value) ? value : fallback
  const clean = amounts
    .map(amount => Number(amount))
    .filter(amount => isValidAmount(amount, currency))
    .map(amount => normalizedAmountValue(amount, currency))
  return clean.length ? [...new Set(clean)].slice(0, 6) : fallback
}

function normalizeAmount(value, currency = 'sat') {
  const amount = Number(value)
  if (!isValidAmount(amount, currency)) {
    throw new Error('amount must be a positive value.')
  }
  return normalizedAmountValue(amount, currency)
}

function isValidAmount(amount, currency) {
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (currency === 'sat' && !Number.isInteger(amount)) return false
  if (amount > 10000000) {
    return false
  }
  return true
}

function normalizedAmountValue(amount, currency) {
  if (currency === 'sat') return Math.trunc(amount)
  return Number(amount.toFixed(2))
}

function normalizeCurrency(value) {
  const currency = cleanText(value, 8).toUpperCase()
  const normalized = currency === 'SATS' ? 'sat' : currency || 'sat'
  if (normalized === 'SAT') return 'sat'
  if (normalized === 'sat') return normalized
  const allowedCurrencies = utils.currencies.list()
  if (!allowedCurrencies.includes(normalized)) {
    throw new Error('currency is not supported.')
  }
  return normalized
}

function safeCurrencies(defaultCurrency = 'sat') {
  const fallback = ['sat', defaultCurrency].filter(Boolean)
  try {
    return [...new Set([...fallback, ...utils.currencies.list()])]
  } catch (_error) {
    return [...new Set(fallback)]
  }
}

function normalizePageSize(value) {
  const size = Number(value || 10)
  if (!Number.isInteger(size) || size <= 0) return 10
  return Math.min(size, 1000)
}

function normalizePage(value) {
  const page = Number(value || 1)
  if (!Number.isInteger(page) || page <= 0) return 1
  return page
}

function normalizeTipSortBy(value) {
  return (
    {
      amountSat: 'amount_sat',
      createdAt: 'created_at',
      jarTitle: 'jar_id',
      name: 'name',
      paid: 'paid',
      paidAt: 'paid_at',
      paymentHash: 'payment_hash'
    }[value] || 'created_at'
  )
}

function normalizePaymentMethod(value) {
  return value === 'onchain' ? 'onchain' : 'lightning'
}

function normalizePlatformSupport(request, paymentMethod) {
  const mode = cleanText(request.platformSupportMode, 32)
  const enabled =
    mode === 'platform' ||
    mode === 'pay_platform' ||
    request.platformSupportEnabled === true

  if (!enabled) {
    return {enabled: false, percentage: 0, lnurl: ''}
  }
  if (paymentMethod !== 'lightning') {
    throw new Error('Platform support is only available for Lightning jars.')
  }

  const percentage = Number(request.platformSupportPercentage)
  if (
    !Number.isInteger(percentage) ||
    percentage < 1 ||
    percentage > 100
  ) {
    throw new Error('Platform support percentage must be an integer from 1 to 100.')
  }

  return {
    enabled: true,
    percentage,
    lnurl: requiredText(request.platformSupportLnurl, 'platform LNURL', 2048)
  }
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

function objectValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function requiredText(value, field, maxLength) {
  const text = cleanText(value, maxLength)
  if (!text) throw new Error(`${field} is required.`)
  return text
}
