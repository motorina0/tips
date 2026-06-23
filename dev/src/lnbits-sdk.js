import {
  createInvoice,
  kvGet,
  kvList,
  kvSet,
  log,
  now,
  randomId,
  watchPayment
} from 'lnbits:extension/host'

export const extensionApi = {
  storage: {
    get(input) {
      return kvGet(input)
    },

    set(input) {
      return kvSet(input)
    },

    list(input) {
      return kvList(input)
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
    }
  },

  payments: {
    watch(input) {
      return watchPayment(input)
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
  get(key, fallback = null) {
    const {value} = extensionApi.storage.get({key})
    if (!value) return fallback
    return JSON.parse(value)
  },

  set(key, value) {
    extensionApi.storage.set({key, value: JSON.stringify(value)})
    return value
  },

  getText(key, fallback = '') {
    return extensionApi.storage.get({key}).value || fallback
  },

  setText(key, value) {
    extensionApi.storage.set({key, value: String(value)})
    return value
  },

  list(prefix) {
    return extensionApi.storage.list({prefix}).keys
  },

  listValues(prefix) {
    return extensionApi.storage
      .list({prefix})
      .keys.map(key => extensionApi.storage.get({key}).value)
      .filter(Boolean)
      .map(value => JSON.parse(value))
  }
}

export const wallet = {
  createInvoice({walletId, amountSat, memo, tag, extra = {}}) {
    const invoiceExtra = {
      tag,
      extension: tag,
      ...extra
    }

    return extensionApi.wallet.createInvoice({
      walletId,
      amountSat,
      memo,
      tag,
      extra: invoiceExtra
    })
  }
}

export const payments = {
  watch(paymentHash, handlerName) {
    extensionApi.payments.watch({paymentHash, callbackExport: handlerName})
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
