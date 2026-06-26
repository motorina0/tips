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
        h('div', {class: 'col-12 col-md-4'}, [
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
                    class: 'q-gutter-md',
                    onSubmit: event => {
                      event?.preventDefault?.()
                      this.createJar()
                    }
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
                          type: 'submit',
                          disable: !this.walletOptions.length,
                          loading: this.creating
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

        h('div', {class: 'col-12 col-md-8'}, [
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
                    onRequest: props => this.fetchJars(props)
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
        ])
      ]),

      h('section', {class: 'row q-col-gutter-md q-mt-md'}, [
        h('div', {class: 'col-12'}, [
          h(
            QCard,
            {dark: true, class: 'panel q-pa-md'},
            {
              default: () => [
                h('div', {class: 'row items-center justify-between q-mb-md'}, [
                  h(
                    'h2',
                    {class: 'text-h6 text-weight-bold q-my-none'},
                    'Result'
                  )
                ]),
                h('pre', this.resultText)
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
