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
        paymentMethod: 'lightning',
        walletId: null,
        watchonlyWalletId: null,
        suggestedAmounts: '100,500,1000',
        thankYouMessage: 'Thanks for the tip.'
      },
      bitcoinRate: {
        loading: false,
        data: null,
        error: ''
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
      selectedJar: null,
      tips: [],
      tipsTable: {
        columns: [
          {
            name: 'createdAt',
            align: 'left',
            label: 'Created',
            field: 'createdAt',
            sortable: true
          },
          {
            name: 'jarTitle',
            align: 'left',
            label: 'Jar',
            field: 'jarTitle',
            sortable: false
          },
          {
            name: 'amountSat',
            align: 'right',
            label: 'Amount',
            field: 'amountSat',
            sortable: true
          },
          {
            name: 'name',
            align: 'left',
            label: 'Name',
            field: 'name',
            sortable: true
          },
          {
            name: 'message',
            align: 'left',
            label: 'Message',
            field: 'message',
            sortable: false
          },
          {
            name: 'paid',
            align: 'left',
            label: 'Status',
            field: 'paid',
            sortable: true
          },
          {
            name: 'paidAt',
            align: 'left',
            label: 'Paid at',
            field: 'paidAt',
            sortable: true
          },
          {
            name: 'paymentHash',
            align: 'left',
            label: 'Payment hash',
            field: 'paymentHash',
            sortable: true
          }
        ],
        loading: false,
        pagination: {
          sortBy: 'createdAt',
          descending: true,
          page: 1,
          rowsPerPage: 10,
          rowsNumber: 0
        },
        search: ''
      },
      wallets: [],
      watchonlyWallets: [],
      watchonlyWalletsLoading: false
    }
  },

  watch: {
    'form.paymentMethod'(value) {
      if (value === 'onchain') {
        this.fetchWatchonlyWallets()
      }
    }
  },

  computed: {
    walletOptions() {
      return this.wallets.map(wallet => ({
        label: wallet.name,
        value: wallet.id
      }))
    },

    watchonlyWalletOptions() {
      return this.watchonlyWallets.map(wallet => ({
        label: wallet.title,
        value: wallet.id
      }))
    },

    canCreateJar() {
      if (this.form.paymentMethod === 'onchain') {
        return !!this.form.watchonlyWalletId && !this.watchonlyWalletsLoading
      }
      return !!this.form.walletId
    }
  },

  async mounted() {
    await Promise.all([
      this.fetchWallets(),
      this.fetchJars(),
      this.fetchBitcoinRate()
    ])
  },

  methods: {
    async fetchBitcoinRate() {
      this.bitcoinRate.loading = true
      this.bitcoinRate.error = ''
      try {
        this.bitcoinRate.data = await client.getBitcoinRate()
      } catch (error) {
        this.bitcoinRate.data = null
        this.bitcoinRate.error =
          error instanceof Error ? error.message : String(error)
      } finally {
        this.bitcoinRate.loading = false
      }
    },

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

    async fetchWatchonlyWallets() {
      if (this.watchonlyWalletsLoading || this.watchonlyWallets.length) return

      this.watchonlyWalletsLoading = true
      try {
        const response = await client.listWatchonlyWallets()
        this.watchonlyWallets = response.wallets || []
        if (!this.form.watchonlyWalletId && this.watchonlyWallets.length) {
          this.form.watchonlyWalletId = this.watchonlyWallets[0].id
        }
      } catch (error) {
        this.showError(error)
      } finally {
        this.watchonlyWalletsLoading = false
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
        if (
          this.selectedJar &&
          this.jars.some(jar => jar.id === this.selectedJar.id)
        ) {
          this.selectedJar = this.jars.find(
            jar => jar.id === this.selectedJar.id
          )
        }
        if (!this.selectedJar && this.jars.length) {
          await this.selectJar(this.jars[0])
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
        const watchonlyWallet = this.watchonlyWallets.find(
          wallet => wallet.id === this.form.watchonlyWalletId
        )
        const jar = await client.createJar({
          title: this.form.title,
          description: this.form.description,
          paymentMethod: this.form.paymentMethod,
          walletId: this.form.walletId,
          walletName: wallet?.name || this.form.walletId,
          watchonlyWalletId: this.form.watchonlyWalletId,
          watchonlyWalletName:
            watchonlyWallet?.title || this.form.watchonlyWalletId,
          suggestedAmounts: this.form.suggestedAmounts
            .split(',')
            .map(value => Number(value.trim()))
            .filter(Boolean),
          thankYouMessage: this.form.thankYouMessage
        })
        await this.fetchJars()
        if (jar?.id) {
          await this.selectJar(jar)
        }
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

    async selectJar(jar) {
      this.selectedJar = jar
      this.tipsTable.pagination.page = 1
      await this.fetchTips()
    },

    async fetchTips(props = {}) {
      if (!this.selectedJar?.id) {
        this.tips = []
        this.tipsTable.pagination.rowsNumber = 0
        return
      }

      const pagination = props.pagination || this.tipsTable.pagination
      this.tipsTable.loading = true
      try {
        const response = await client.listTips(this.selectedJar.id, {
          page: pagination.page,
          rowsPerPage: pagination.rowsPerPage,
          sortBy: pagination.sortBy,
          descending: pagination.descending === true,
          search: this.tipsTable.search || ''
        })
        this.tips = response.tips || []
        this.tipsTable.pagination = {
          ...pagination,
          rowsNumber: response.total || 0
        }
      } catch (error) {
        this.showError(error)
      } finally {
        this.tipsTable.loading = false
      }
    },

    searchTips() {
      this.tipsTable.pagination.page = 1
      this.fetchTips()
    },

    publicJarUrl(jarId) {
      return new URL(
        `/ext/tips/jars/${encodeURIComponent(jarId)}`,
        window.location.href
      ).href
    },

    async copyPublicUrl(url) {
      await navigator.clipboard.writeText(url).catch(() => {})
    },

    showError(error) {
      const message = error instanceof Error ? error.message : String(error)
      client.notifyError(message).catch(() => {})
    },

    formatTimestamp(timestamp) {
      if (!timestamp) return '-'
      const millis = Number(timestamp) < 1000000000000 ? timestamp * 1000 : timestamp
      return new Date(millis).toLocaleString()
    },

    formatUsd(value) {
      const amount = Number(value)
      if (!Number.isFinite(amount)) return '-'
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: amount >= 1 ? 2 : 4
      }).format(amount)
    }
  },

  render() {
    const h = Vue.h
    const component = name => Vue.resolveComponent(name)
    const QBtn = component('q-btn')
    const QCard = component('q-card')
    const QForm = component('q-form')
    const QIcon = component('q-icon')
    const QInput = component('q-input')
    const QRadio = component('q-radio')
    const QSelect = component('q-select')
    const QTable = component('q-table')
    const QTd = component('q-td')
    const QTooltip = component('q-tooltip')

    const formInput = (field, props = {}, slots = undefined) =>
      h(
        QInput,
        {
          modelValue: this.form[field],
          'onUpdate:modelValue': value => {
            this.form[field] = value
          },
          dark: true,
          filled: true,
          dense: true,
          ...props
        },
        slots
      )

    return h('main', {class: 'shell q-pa-md', 'data-theme': 'bitcoin'}, [
      h('header', {class: 'row items-center justify-between q-mb-md q-gutter-md'}, [
        h('div', {class: 'row items-center q-gutter-sm'}, [
          h('img', {
            class: 'tips-icon',
            src: '/ext-assets/tips/assets/icon.png',
            alt: ''
          }),
          h('div', [
            h('h1', {class: 'text-h4 text-weight-bold q-my-none'}, 'Tips'),
            h(
              'p',
              {class: 'text-subtitle2 text-grey-5 q-my-none'},
              'Manage public tip jars.'
            )
          ])
        ]),
        h(
          'div',
          {class: 'runtime-status text-caption text-grey-5 rounded-borders'},
          'sandbox bridge'
        )
      ]),

      h('section', {class: 'row q-col-gutter-md'}, [
        h('div', {class: 'col-12'}, [
          h(
            QCard,
            {dark: true, class: 'panel q-pa-md full-height'},
            {
              default: () => [
                h('div', {class: 'row items-center justify-between q-mb-sm'}, [
                  h(
                    'h2',
                    {class: 'text-h6 text-weight-bold q-my-none'},
                    'Bitcoin Rate'
                  ),
                  h(
                    QBtn,
                    {
                      flat: true,
                      dense: true,
                      icon: 'refresh',
                      loading: this.bitcoinRate.loading,
                      onClick: this.fetchBitcoinRate
                    },
                    {
                      default: () => [
                        h(
                          QTooltip,
                          {},
                          {
                            default: () => 'Refresh rate'
                          }
                        )
                      ]
                    }
                  )
                ]),
                this.bitcoinRate.data
                  ? h('div', {class: 'row q-col-gutter-md'}, [
                      h('div', {class: 'col-12 col-sm-4'}, [
                        h(
                          'div',
                          {class: 'text-caption text-grey-5'},
                          'Source'
                        ),
                        h(
                          'div',
                          {class: 'text-subtitle1 text-weight-medium'},
                          this.bitcoinRate.data.source || 'External rate'
                        )
                      ]),
                      h('div', {class: 'col-12 col-sm-4'}, [
                        h(
                          'div',
                          {class: 'text-caption text-grey-5'},
                          'BTC/USD'
                        ),
                        h(
                          'div',
                          {class: 'text-subtitle1 text-weight-medium'},
                          this.formatUsd(this.bitcoinRate.data.btcUsd)
                        )
                      ]),
                      h('div', {class: 'col-12 col-sm-4'}, [
                        h(
                          'div',
                          {class: 'text-caption text-grey-5'},
                          '1,000 sats'
                        ),
                        h(
                          'div',
                          {class: 'text-subtitle1 text-weight-medium'},
                          this.formatUsd(this.bitcoinRate.data.sampleAmountUsd)
                        )
                      ])
                    ])
                  : h(
                      'p',
                      {class: 'muted q-my-none'},
                      this.bitcoinRate.error || 'Rate unavailable.'
                    )
              ]
            }
          )
        ]),

        h('div', {class: 'col-12'}, [
          h(
            QCard,
            {dark: true, class: 'panel q-pa-md full-height'},
            {
              default: () => [
                h('div', {class: 'row items-center justify-between q-mb-md'}, [
                  h(
                    'h2',
                    {class: 'text-h6 text-weight-bold q-my-none'},
                    'Create Jar'
                  )
                ]),
                h(
                  QForm,
                  {
                    class: 'q-gutter-md'
                  },
                  {
                    default: () => [
                      formInput('title', {
                        label: 'Title',
                        maxlength: 80
                      }),
                      formInput('description', {
                        label: 'Description',
                        type: 'textarea',
                        maxlength: 280
                      }),
                      h('div', {class: 'row q-gutter-sm'}, [
                        h(QRadio, {
                          modelValue: this.form.paymentMethod,
                          'onUpdate:modelValue': value => {
                            this.form.paymentMethod = value
                          },
                          dark: true,
                          dense: true,
                          val: 'lightning',
                          label: 'Lightning'
                        }),
                        h(QRadio, {
                          modelValue: this.form.paymentMethod,
                          'onUpdate:modelValue': value => {
                            this.form.paymentMethod = value
                          },
                          dark: true,
                          dense: true,
                          val: 'onchain',
                          label: 'Onchain'
                        })
                      ]),
                      this.form.paymentMethod === 'onchain'
                        ? h(QSelect, {
                            modelValue: this.form.watchonlyWalletId,
                            'onUpdate:modelValue': value => {
                              this.form.watchonlyWalletId = value
                            },
                            dark: true,
                            filled: true,
                            dense: true,
                            emitValue: true,
                            mapOptions: true,
                            label: 'Onchain account',
                            options: this.watchonlyWalletOptions,
                            loading: this.watchonlyWalletsLoading,
                            disable:
                              this.watchonlyWalletsLoading ||
                              !this.watchonlyWalletOptions.length
                          })
                        : h(QSelect, {
                            modelValue: this.form.walletId,
                            'onUpdate:modelValue': value => {
                              this.form.walletId = value
                            },
                            dark: true,
                            filled: true,
                            dense: true,
                            emitValue: true,
                            mapOptions: true,
                            label: 'Wallet',
                            options: this.walletOptions,
                            disable: !this.walletOptions.length
                          }),
                      formInput('suggestedAmounts', {
                        label: 'Suggested amounts'
                      }),
                      formInput('thankYouMessage', {
                        label: 'Thank you message',
                        maxlength: 160
                      }),
                      h(
                        QBtn,
                        {
                          unelevated: true,
                          color: 'primary',
                          class: 'full-width',
                          type: 'button',
                          disable: !this.canCreateJar,
                          loading: this.creating,
                          onClick: this.createJar
                        },
                        {
                          default: () => 'Create'
                        }
                      )
                    ]
                  }
                )
              ]
            }
          )
        ]),

        h('div', {class: 'col-12'}, [
          h(
            QCard,
            {dark: true, class: 'panel q-pa-md full-height'},
            {
              default: () => [
                h(
                  QTable,
                  {
                    dark: true,
                    flat: true,
                    dense: true,
                    binaryStateSort: true,
                    rowKey: 'id',
                    rows: this.jars,
                    columns: this.jarsTable.columns,
                    pagination: this.jarsTable.pagination,
                    'onUpdate:pagination': value => {
                      this.jarsTable.pagination = value
                    },
                    loading: this.jarsTable.loading,
                    onRequest: props => this.fetchJars(props),
                    onRowClick: (_event, row) => this.selectJar(row)
                  },
                  {
                    top: () =>
                      h(
                        'div',
                        {
                          class:
                            'row items-center justify-between full-width q-gutter-sm'
                        },
                        [
                          h(
                            'h2',
                            {class: 'text-h6 text-weight-bold q-my-none'},
                            'Jars'
                          ),
                          h(
                            QInput,
                            {
                              modelValue: this.jarsTable.search,
                              'onUpdate:modelValue': value => {
                                this.jarsTable.search = value || ''
                                this.searchJars()
                              },
                              dark: true,
                              filled: true,
                              dense: true,
                              clearable: true,
                              debounce: 300,
                              placeholder: 'Search jars',
                              class: 'jar-search'
                            },
                            {
                              prepend: () => h(QIcon, {name: 'search'})
                            }
                          )
                        ]
                      ),

                    'body-cell-publicUrl': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () =>
                            h(QInput, {
                              dark: true,
                              dense: true,
                              borderless: true,
                              readonly: true,
                              modelValue: this.publicJarUrl(props.row.id),
                              inputClass: 'text-caption'
                            })
                        }
                      ),

                    'body-cell-actions': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () =>
                            h(
                              QBtn,
                              {
                                flat: true,
                                dense: true,
                                round: true,
                                icon: 'content_copy',
                                onClick: () =>
                                  this.copyPublicUrl(
                                    this.publicJarUrl(props.row.id)
                                  )
                              },
                              {
                                default: () => [
                                  h(
                                    QTooltip,
                                    {},
                                    {
                                      default: () => 'Copy public link'
                                    }
                                  )
                                ]
                              }
                            )
                        }
                      )
                  }
                )
              ]
            }
          )
        ]),

        h('div', {class: 'col-12'}, [
          h(
            QCard,
            {dark: true, class: 'panel q-pa-md full-height'},
            {
              default: () => [
                h(
                  QTable,
                  {
                    dark: true,
                    flat: true,
                    dense: true,
                    binaryStateSort: true,
                    rowKey: 'id',
                    rows: this.tips,
                    columns: this.tipsTable.columns,
                    pagination: this.tipsTable.pagination,
                    'onUpdate:pagination': value => {
                      this.tipsTable.pagination = value
                    },
                    loading: this.tipsTable.loading,
                    onRequest: props => this.fetchTips(props)
                  },
                  {
                    top: () =>
                      h(
                        'div',
                        {
                          class:
                            'row items-center justify-between full-width q-gutter-sm'
                        },
                        [
                          h('div', [
                            h(
                              'h2',
                              {class: 'text-h6 text-weight-bold q-my-none'},
                              'Tips'
                            ),
                            h(
                              'p',
                              {class: 'text-caption text-grey-5 q-my-none'},
                              this.selectedJar
                                ? `Selected jar: ${this.selectedJar.title}`
                                : 'Select a jar to view its tips.'
                            )
                          ]),
                          h('div', {class: 'row items-center q-gutter-sm'}, [
                            h(
                              QInput,
                              {
                                modelValue: this.tipsTable.search,
                                'onUpdate:modelValue': value => {
                                  this.tipsTable.search = value || ''
                                  this.searchTips()
                                },
                                dark: true,
                                filled: true,
                                dense: true,
                                clearable: true,
                                debounce: 300,
                                placeholder: 'Search tips',
                                class: 'jar-search',
                                disable: !this.selectedJar
                              },
                              {
                                prepend: () => h(QIcon, {name: 'search'})
                              }
                            ),
                            h(
                              QBtn,
                              {
                                flat: true,
                                dense: true,
                                label: 'Refresh',
                                disable: !this.selectedJar,
                                loading: this.tipsTable.loading,
                                onClick: () => this.fetchTips()
                              }
                            )
                          ])
                        ]
                      ),

                    'body-cell-createdAt': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () => this.formatTimestamp(props.row.createdAt)
                        }
                      ),

                    'body-cell-amountSat': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () => `${props.row.amountSat} sats`
                        }
                      ),

                    'body-cell-paid': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () => (props.row.paid ? 'Paid' : 'Pending')
                        }
                      ),

                    'body-cell-paidAt': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () => this.formatTimestamp(props.row.paidAt)
                        }
                      ),

                    'body-cell-paymentHash': props =>
                      h(
                        QTd,
                        {props},
                        {
                          default: () =>
                            h('span', {class: 'text-caption'}, props.row.paymentHash)
                        }
                      )
                  }
                )
              ]
            }
          )
        ])
      ])
    ])
  }
})

app.use(Quasar)
app.mount('#tips-admin-app')
