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
      wallets: []
    }
  },

  computed: {
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
              'Manage public Lightning tip jars.'
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
                      h(QSelect, {
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
                          disable: !this.walletOptions.length,
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
