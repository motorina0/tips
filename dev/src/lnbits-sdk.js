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

export const extensionApi = {
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
        memo: input.memo || ''
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

export const storage = {
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

export const wallet = {
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

  createInvoicePublic({sourceId, amount, currency = 'sat', memo = ''}) {
    return extensionApi.wallet.createInvoicePublic({
      sourceId,
      amount,
      currency,
      memo
    })
  }
}

export const system = {
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
