import {
  createInvoice,
  createInvoicePublic,
  listUserWallets,
  log,
  now,
  randomId,
  storageDelete,
  storageGet,
  storageGetPublic,
  storageGetPaginated,
  storageSet
} from 'lnbits:extension/host'

const extensionApi = {
  storage: {
    get(input) {
      return storageGet(input)
    },

    getPublic(input) {
      return storageGetPublic(input)
    },

    set(input) {
      return storageSet({
        table: input.table,
        dataJson: JSON.stringify(input.data || {})
      })
    },

    getPaginated(input) {
      return storageGetPaginated({
        table: input.table,
        filtersJson: JSON.stringify(input.filters || {}),
        search: input.search || '',
        searchFields: input.searchFields || [],
        sortBy: input.sortBy || '',
        descending: input.descending === true,
        limit: input.limit || 25,
        offset: input.offset || 0
      })
    },

    delete(input) {
      return storageDelete(input)
    }
  },

  wallet: {
    createInvoice(input) {
      return createInvoice({
        ...input,
        amountSat: BigInt(input.amountSat),
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    },

    createInvoicePublic(input) {
      return createInvoicePublic({
        sourceId: input.sourceId,
        amount: Number(input.amount),
        currency: input.currency || 'sat',
        memo: input.memo || '',
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    },

    listUserWallets() {
      return listUserWallets()
    }
  },

  system: {
    id(input) {
      return randomId(input)
    },

    now() {
      return now()
    },

    log(input) {
      return log(input)
    }
  }
}

const storage = {
  get(table, id, fallback = null) {
    const {dataJson} = extensionApi.storage.get({table, id})
    if (!dataJson) return fallback
    return JSON.parse(dataJson)
  },

  getPublic(table, id, fallback = null) {
    const {dataJson} = extensionApi.storage.getPublic({table, id})
    if (!dataJson) return fallback
    return JSON.parse(dataJson)
  },

  set(table, data) {
    extensionApi.storage.set({table, data})
    return data
  },

  getPaginated(table, options = {}) {
    const {rowsJson, total} = extensionApi.storage.getPaginated({
      table,
      filters: options.filters || {},
      search: options.search || '',
      searchFields: options.searchFields || [],
      sortBy: options.sortBy || '',
      descending: options.descending === true,
      limit: options.limit || 25,
      offset: options.offset || 0
    })
    return {
      data: JSON.parse(rowsJson || '[]'),
      total: Number(total || 0)
    }
  },

  delete(table, id) {
    extensionApi.storage.delete({table, id})
  }
}

const wallet = {
  listUserWallets() {
    return extensionApi.wallet.listUserWallets().wallets || []
  },

  createInvoice({walletId, amountSat, memo, tag, extra = {}}) {
    const invoiceExtra = {
      tag,
      ...extra
    }

    return extensionApi.wallet.createInvoice({
      walletId,
      amountSat,
      currency: 'sat',
      memo,
      tag,
      extra: invoiceExtra
    })
  },

  createInvoicePublic({sourceId, amount, currency = 'sat', memo = '', extra = {}}) {
    return extensionApi.wallet.createInvoicePublic({
      sourceId,
      amount,
      currency,
      memo,
      extra
    })
  }
}

const system = {
  id(prefix) {
    return extensionApi.system.id({prefix}).id
  },

  now() {
    return Number(extensionApi.system.now().timestamp)
  },

  log(message, level = 'info') {
    extensionApi.system.log({level, message})
  }
}


const JARS_TABLE = 'tip_jars'
const TIPS_TABLE = 'tips'
const JAR_SEARCH_FIELDS = ['title', 'description', 'wallet_name', 'thank_you_message']
const TIP_SEARCH_FIELDS = ['name', 'message', 'payment_hash']

export function createTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const id = cleanId(request.id) || system.id('tipjar')
    const title = cleanText(request.title, 80) || 'Tip jar'
    const description = cleanText(request.description, 280)
    const walletId = requiredText(request.walletId, 'walletId', 128)
    const walletName = cleanText(request.walletName, 120) || walletId
    const thankYouMessage =
      cleanText(request.thankYouMessage, 160) || 'Thanks for the tip.'
    const suggestedAmounts = normalizeAmounts(request.suggestedAmounts)
    const timestamp = system.now()

    const jar = {
      id,
      title,
      description,
      wallet_id: walletId,
      wallet_name: walletName,
      slug: cleanSlug(request.slug) || id,
      suggested_amounts: suggestedAmounts,
      thank_you_message: thankYouMessage,
      created_at: timestamp,
      updated_at: timestamp
    }

    storage.set(JARS_TABLE, jar)
    system.log(`tips: created jar ${id}`)
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

export function getPublicTipJar(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getPublicJar(jarId)
    return {jar: publicJar(jar), tips: []}
  })
}

export function createTipInvoice(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const jarId = requiredText(request.jarId, 'jarId', 128)
    const jar = getPublicJar(jarId)
    const amount = normalizeAmount(request.amount ?? request.amountSat)
    const name = cleanText(request.name, 60) || 'Anonymous'
    const message = cleanText(request.message, 280)
    const memo = message ? `${jar.title}: ${message}` : jar.title

    const invoice = wallet.createInvoicePublic({
      sourceId: jarId,
      amount,
      currency: 'sat',
      memo,
      extra: {name, message}
    })

    return {
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

      const paidTip = {...tip, paid: true, paid_at: system.now()}
      storage.set(TIPS_TABLE, paidTip)
      system.log(`tips: marked tip ${paidTip.id} as paid`)
      return {ok: true, tipId: paidTip.id, paid: true}
    }

    if (!sourceId) {
      return {ok: false, error: 'payment source not found'}
    }

    const paidTip = paidTipFromEvent(event, sourceId, paymentHash)
    storage.set(TIPS_TABLE, paidTip)
    system.log(`tips: recorded paid public tip ${paidTip.id}`)
    return {ok: true, tipId: paidTip.id, paid: true}
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
  return (
    cleanText(event.tipId, 128) ||
    cleanText(event.tip_id, 128) ||
    cleanText(event.extra?.tipId, 128) ||
    cleanText(event.extra?.tip_id, 128) ||
    cleanText(event.payment?.extra?.tipId, 128) ||
    cleanText(event.payment?.extra?.tip_id, 128)
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

function publicJar(jar) {
  return {
    id: jar.id,
    title: jar.title,
    description: jar.description,
    walletName: jar.wallet_name,
    slug: jar.slug,
    suggestedAmounts: jar.suggested_amounts,
    thankYouMessage: jar.thank_you_message,
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
    throw new Error('amount must be a positive integer.')
  }
  if (amount > 10000000) {
    throw new Error('amount exceeds the extension limit.')
  }
  return amount
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
