const client = window.createLNbitsExtensionClient({
  extensionId: 'tips'
})

const app = Vue.createApp({
  data() {
    return {
      creating: false,
      form: {
        title: 'Support the project',
        description: 'Leave a tip and a short message.',
        walletId: null,
        suggestedAmounts: '100,500,1000',
        thankYouMessage: 'Thanks for the tip.'
      },
      jars: [],
      jarsTable: {
        columns: [
          {
            name: 'title',
            align: 'left',
            label: 'Title',
            field: 'title',
            sortable: true
          },
          {
            name: 'walletName',
            align: 'left',
            label: 'Wallet',
            field: 'walletName',
            sortable: false
          },
          {
            name: 'description',
            align: 'left',
            label: 'Description',
            field: 'description',
            sortable: false
          },
          {
            name: 'publicUrl',
            align: 'left',
            label: 'Public Page',
            field: 'id',
            sortable: false
          },
          {
            name: 'actions',
            align: 'right',
            label: '',
            field: 'id',
            sortable: false
          }
        ],
        loading: false,
        pagination: {
          sortBy: 'title',
          descending: false,
          page: 1,
          rowsPerPage: 10,
          rowsNumber: 0
        },
        search: ''
      },
      result: {},
      wallets: []
    }
  },

  computed: {
    resultText() {
      return JSON.stringify(this.result, null, 2)
    },

    walletOptions() {
      return this.wallets.map(wallet => ({
        label: wallet.name,
        value: wallet.id
      }))
    }
  },

  async mounted() {
    await Promise.all([this.fetchWallets(), this.fetchJars()])
  },

  methods: {
    async fetchWallets() {
      try {
        const response = await client.listWallets()
        this.wallets = response.wallets || []
        if (!this.form.walletId && this.wallets.length) {
          this.form.walletId = this.wallets[0].id
        }
      } catch (error) {
        this.showError(error)
      }
    },

    async fetchJars(props = {}) {
      const pagination = props.pagination || this.jarsTable.pagination
      this.jarsTable.loading = true
      try {
        const response = await client.listJars({
          page: pagination.page,
          rowsPerPage: pagination.rowsPerPage,
          sortBy: pagination.sortBy,
          descending: pagination.descending === true,
          search: this.jarsTable.search || ''
        })
        this.jars = response.jars || []
        this.jarsTable.pagination = {
          ...pagination,
          rowsNumber: response.total || 0
        }
      } catch (error) {
        this.showError(error)
      } finally {
        this.jarsTable.loading = false
      }
    },

    async createJar() {
      this.creating = true
      try {
        const wallet = this.wallets.find(
          wallet => wallet.id === this.form.walletId
        )
        const jar = await client.createJar({
          title: this.form.title,
          description: this.form.description,
          walletId: this.form.walletId,
          walletName: wallet?.name || this.form.walletId,
          suggestedAmounts: this.form.suggestedAmounts
            .split(',')
            .map(value => Number(value.trim()))
            .filter(Boolean),
          thankYouMessage: this.form.thankYouMessage
        })
        await this.fetchJars()
        this.showResult({
          jar,
          publicUrl: this.publicJarUrl(jar.id)
        })
      } catch (error) {
        this.showError(error)
      } finally {
        this.creating = false
      }
    },

    searchJars() {
      this.jarsTable.pagination.page = 1
      this.fetchJars()
    },

    publicJarUrl(jarId) {
      return new URL(
        `/ext/tips/jars/${encodeURIComponent(jarId)}`,
        window.location.href
      ).href
    },

    async copyPublicUrl(url) {
      try {
        await navigator.clipboard.writeText(url)
        this.showResult({copied: true, publicUrl: url})
      } catch (_error) {
        this.showResult({publicUrl: url})
      }
    },

    showResult(value) {
      this.result = value
    },

    showError(error) {
      const message = error instanceof Error ? error.message : String(error)
      this.result = {error: message}
      client.notifyError(message).catch(() => {})
    }
  }
})

app.use(Quasar)
app.mount('#tips-admin-app')
