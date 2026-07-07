# Tips Extension Agent Guide

This file explains the structure of the Tips WASM extension so another AI agent
can use it as a reference for building LNbits WASM extensions.

## Purpose

Tips is a WASM extension that lets an authenticated LNbits user create public
tip jars. Public visitors can open a jar page, create a Lightning invoice, and
leave a name/message. When the invoice is paid, LNbits calls the extension event
export so the extension can record the paid tip.

## Directory Structure

```text
config.json
manifest.json
wasm/
  module.wasm
  lnbits-extension.wit
ui/
  admin.html
  public.html
static/
  admin.js
  public.js
  app.css
  lnbits-extension-sdk.js
  assets/
    icon.png
storage/
  schema.json
  migrations/
dev/
  package.json
  scripts/bundle.mjs
  src/
    index.js
    lnbits-sdk.js
```

Core runtime files:

- `config.json`: declares routes, exports, permissions, and events.
- `wasm/module.wasm`: compiled extension module loaded by LNbits.
- `wasm/lnbits-extension.wit`: host/import/export interface used to build the
  WASM component.
- `ui/*.html`: sandboxed iframe entrypoints served by LNbits.
- `static/*`: browser assets served under `/ext-assets/{ext_id}/...`.
- `storage/schema.json`: current storage schema.
- `storage/migrations/*.json`: ordered storage migrations.

Development files:

- `dev/src/index.js`: source for the WASM exports.
- `dev/src/lnbits-sdk.js`: small JS wrapper around LNbits host functions.
- `dev/package.json`: build/check commands.
- `dev/dist/*`: generated bundle input for `jco`.

## Config Contract

`config.json` is the main contract between LNbits core and the extension.

Required high-level fields:

- `id`: extension id. Must match the extension folder name.
- `name`: display name.
- `short_description`: short UI text.
- `version`: extension version.
- `min_lnbits_version`: minimum LNbits version expected by the extension.
- `extension_type`: must be `"wasm"`.
- `wasm.module`: relative path to the compiled module.
- `wasm.exports`: list of exported WASM functions LNbits may call.
- `ui_routes`: UI pages served under `/ext/...`.
- `api_routes`: REST-like routes served under `/api/v1/ext/{id}/...`.
- `permissions`: capabilities requested at install time.

Optional fields used by this extension:

- `events.onInvoicePaid`: export to call when an invoice for this extension is
  paid.

Do not add build-only metadata to `config.json`. Build commands belong in
`dev/package.json` or project docs, not in the deployed runtime config.

## WASM Exports

Each entry in `wasm.exports` must match an exported function from
`dev/src/index.js` after it is compiled into `wasm/module.wasm`.

Visibility values:

- `authenticated`: callable only with an authenticated LNbits account.
- `public`: callable from public extension pages.
- `event`: callable by LNbits background/event dispatch.

The JS source follows this shape:

```js
export function someExport(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    return {ok: true}
  })
}
```

The extension returns JSON strings. Use `runJson()` so errors are converted into
consistent `{ok: false, error}` responses.

## Routes

UI routes:

- `path`: public LNbits wrapper path under `/ext`.
- `entrypoint`: HTML file from `ui/`.
- `auth`: `user` or `public`.
- `path_params`: explicit mapping from URL params to payload names.

API routes:

- `method`: HTTP method exposed by LNbits.
- `path`: route path under `/api/v1/ext/{id}`.
- `export`: WASM export name to invoke.
- `auth`: `user` or `public`.
- `path_params`: explicit mapping from URL params to payload names.

Example:

```json
{
  "method": "GET",
  "path": "/jars/{jar_id}",
  "export": "get-public-tip-jar",
  "auth": "public",
  "path_params": {
    "jar_id": "jarId"
  }
}
```

Do not rely on implicit name conversion. If a route contains `{jar_id}`, map it
explicitly.

## Browser Runtime

The extension UI runs inside a sandboxed iframe. It should not call LNbits core
APIs directly or rely on LNbits cookies.

Browser flow:

1. User opens `/ext/tips` or `/ext/tips/jars/{jar_id}`.
2. LNbits serves a wrapper page.
3. The wrapper loads the sandboxed iframe.
4. The iframe uses `static/lnbits-extension-sdk.js`.
5. The SDK talks to the wrapper through `postMessage`.
6. The wrapper performs allowed API calls and sends responses back.

Use the frontend SDK methods instead of raw `fetch()` where possible.

## WASM Host API

The WASM module does not directly access LNbits internals. It imports host
functions through `lnbits-extension.wit`, wrapped by `dev/src/lnbits-sdk.js`.

Common host namespaces:

- `storage`: read/write extension-owned storage.
- `wallet`: list wallets and create invoices.
- `extension`: call allowed APIs from other installed extensions.
- `utils`: currency and Lightning helpers.
- `system`: IDs, timestamps, and logs.

The host enforces permissions and owner scoping. Do not store user ids in
extension data; LNbits core owns hidden owner isolation.

## Storage

Define storage in `storage/schema.json`.

Rules:

- Every table needs an `id` field.
- Use migrations for changes after the initial schema.
- Use snake_case field names in storage rows.
- Public data must be explicitly exposed through `ext.storage.read_public`.
- Do not expose wallet ids or private operational fields through public fields.

Tips uses:

- `tip_jars`: jar metadata, wallet reference, payment method, public text.
- `tips`: individual tip records and payment state.

Storage is accessed from WASM through the SDK:

```js
storage.set('tip_jars', jar)
const jar = storage.get('tip_jars', jarId)
const publicJar = storage.getPublic('tip_jars', jarId)
const page = storage.getPaginated('tips', {filters: {jar_id: jarId}})
```

## Permissions

Permissions in `config.json` are shown to the installer and enforced by core.

Tips currently uses:

- `ext.storage.read`
- `ext.storage.read_public`
- `ext.storage.write`
- `wallet.create_invoice`
- `wallet.create_invoice_public`
- `wallet.list`
- `utils.basic`
- `extension.api.request`

Policy examples:

```json
{
  "id": "ext.storage.read_public",
  "description": "Read public tip jar fields for public pages.",
  "policies": [
    {
      "table_name": "tip_jars",
      "public_fields": ["id", "title", "description"]
    }
  ]
}
```

```json
{
  "id": "wallet.create_invoice_public",
  "description": "Create incoming Lightning invoices for selected wallets.",
  "policies": [
    {
      "table": "tip_jars",
      "wallet_field": "wallet_id"
    }
  ]
}
```

```json
{
  "id": "extension.api.request",
  "description": "Read Watchonly accounts and create receive addresses.",
  "policies": [
    {
      "id": "watchonly",
      "access": ["read"]
    }
  ]
}
```

Do not add a permission unless the extension actually calls the matching host
API.

## Payment Flow

Public Lightning tip flow:

1. Public page loads a jar using `storage.getPublic`.
2. Public page posts to the extension invoice API route.
3. WASM calls `wallet.createInvoicePublic({sourceId, amount, currency, memo})`.
4. LNbits core finds the source row by `sourceId`, reads the configured
   `wallet_field`, and creates the invoice.
5. When paid, LNbits dispatches `events.onInvoicePaid`.
6. The extension event export records or marks the tip as paid.

The public page must not choose the wallet id directly. The wallet comes from
extension storage and the `wallet.create_invoice_public` policy.

## Build

Tips is authored in JavaScript and compiled to a WASM component with `jco`.

Build command:

```bash
cd lnbits/extensions/tips/dev
npm run build:wasm
```

This bundles `dev/src/index.js` and writes `../wasm/module.wasm`.

Check command:

```bash
cd lnbits/extensions/tips/dev
npm run check
```

If exports, host imports, or WIT definitions change, rebuild the WASM module.

## Adding A Feature

1. Update storage schema/migrations if data shape changes.
2. Add or update WASM export code in `dev/src/index.js`.
3. Add host helper wrappers in `dev/src/lnbits-sdk.js` only when needed.
4. Add or update `config.json` exports, routes, events, and permissions.
5. Update `ui/*.html`, `static/*.js`, and `static/app.css` for browser behavior.
6. Rebuild `wasm/module.wasm`.
7. Validate `config.json` and storage JSON.

## Validation

Useful checks:

```bash
python -m json.tool lnbits/extensions/tips/config.json
python -m json.tool lnbits/extensions/tips/storage/schema.json
cd lnbits/extensions/tips/dev && npm run check
cd lnbits/extensions/tips/dev && npm run build:wasm
```

If core-facing config changed, reinstall the extension in LNbits before testing.

## Design Rules

- Keep LNbits core extension-agnostic.
- Keep public pages unauthenticated, not untrusted-by-default.
- Use explicit config fields; avoid fallback names or hidden conventions.
- Public data must be allow-listed.
- Browser UI must go through the sandbox bridge.
- WASM code must go through host functions and declared permissions.
- Do not expose access tokens, wallet ids, owner ids, or raw private storage in
  public responses.
