# LNbits WASM Extension Agent Guide

This guide describes the expected structure of an LNbits WASM extension so AI
agents can create, review, or modify extensions without relying on a specific
example implementation.

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
  package.json or Cargo.toml
  scripts/
  src/
    index.js or lib.rs
    lnbits-sdk.js for JavaScript components
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

- JavaScript components usually keep WASM source in `dev/src/index.js`, host
  wrappers in `dev/src/lnbits-sdk.js`, and build/check commands in
  `dev/package.json`.
- Rust components usually keep WASM source in `dev/src/lib.rs` and component
  metadata/dependencies in `dev/Cargo.toml`.
- Generated build output under `dev/dist/` or language build directories should
  only be edited by the build tool.

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

Common optional fields:

- `events.onInvoicePaid`: export to call when an invoice for this extension is
  paid.
- `wasm.resource_limits.max_response_bytes`: maximum serialized WASM response
  size.

Do not put build-only metadata in the deployed runtime contract unless a
separate tool explicitly consumes it. Prefer build commands in
`dev/package.json`, `Cargo.toml`, a Makefile, or project docs.

## WASM Exports

Each entry in `wasm.exports` must match an exported function from
`dev/src/index.js` after it is compiled into `wasm/module.wasm`.

Visibility values:

- `authenticated`: callable only with an authenticated LNbits account.
- `public`: callable from public extension pages.
- `event`: callable by LNbits background/event dispatch.

JavaScript exports should follow this shape:

```js
export function someExport(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    return {ok: true, data: {}}
  })
}
```

Rust exports should follow this shape:

```rust
impl Guest for Component {
    fn some_export(request_json: String) -> String {
        run_json(|| {
            let request: SomeRequest = parse_request(&request_json)?;
            Ok(json!({"ok": true, "data": {}}))
        })
    }
}

export!(Component);
```

Every export should return a JSON string with a consistent `{ok, data, error}`
shape. Use shared parsing and `run_json()` helpers so validation failures become
safe, predictable responses.

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
  "path": "/items/{item_id}",
  "export": "get-public-item",
  "auth": "public",
  "path_params": {
    "item_id": "itemId"
  }
}
```

Do not rely on implicit name conversion. If a route contains `{item_id}`, map it
explicitly.

Only expose public routes for data and actions that are safe without an
authenticated account. Keep wallet balance reads, outgoing payments, admin
actions, and private storage behind `user` routes.

## Browser Runtime

The extension UI runs inside a sandboxed iframe. It should not call LNbits core
APIs directly or rely on LNbits cookies.

Browser flow:

1. User opens an extension wrapper path such as `/ext/{ext_id}`.
2. LNbits serves a wrapper page.
3. The wrapper loads the sandboxed iframe entrypoint from `ui/`.
4. The iframe loads browser assets from `/ext-assets/{ext_id}/...`.
5. The frontend SDK talks to the wrapper through `postMessage`.
6. The wrapper performs allowed API calls and sends responses back.

Use the frontend SDK methods instead of raw `fetch()` where possible. Add direct
browser API calls only when they work within the iframe sandbox and content
security policy.

## WASM Host API

The WASM module does not directly access LNbits internals. It imports host
functions through `lnbits-extension.wit`, wrapped by language-specific SDK code.

Common host namespaces:

- `storage`: read/write extension-owned storage.
- `wallet`: list wallets, inspect balances, create invoices, and pay invoices
  when permission allows.
- `extension`: call allowed APIs from other installed extensions.
- `utils`: currency and Lightning helpers.
- `system`: IDs, timestamps, and logs.

The host enforces permissions and owner scoping. Do not store LNbits user ids,
access tokens, or owner ids in extension data; LNbits core owns isolation.

## Storage

Define storage in `storage/schema.json`.

Rules:

- Every table needs an `id` field.
- Use migrations for changes after the initial schema.
- Use snake_case field names in storage rows.
- Public data must be explicitly exposed through `ext.storage.read_public`.
- Do not expose wallet ids or private operational fields through public fields.
- Do not write or query reserved internal owner fields.

Storage is accessed from WASM through the SDK:

```js
storage.set('entity_table', entity)
const entity = storage.get('entity_table', entityId)
const publicEntity = storage.getPublic('entity_table', entityId)
const page = storage.getPaginated('event_table', {
  filters: {entity_id: entityId}
})
```

Use storage schemas as the source of truth. Reject unknown fields before storing
records, and keep public response objects smaller than the configured WASM
response limit.

## Permissions

Permissions in `config.json` are shown to the installer and enforced by core.

Common permissions:

- `ext.storage.read`: read authenticated extension storage.
- `ext.storage.read_public`: read allow-listed public fields.
- `ext.storage.write`: write extension storage.
- `wallet.list`: list wallets for the authenticated user.
- `wallet.balance.read`: read wallet balances for the authenticated user.
- `wallet.create_invoice`: create invoices from authenticated context.
- `wallet.create_invoice_public`: create invoices from configured public
  storage sources.
- `wallet.pay_invoice`: pay invoices from user-owned wallets.
- `extension.api.request`: call allow-listed installed extension APIs.
- `http.request`: call allow-listed external HTTPS origins.
- `utils.basic`: use common LNbits utility helpers.
- `ui.camera.scan_qr`: request camera scanning through the parent UI bridge.

Policy examples:

```json
{
  "id": "ext.storage.read_public",
  "description": "Read public fields for public pages.",
  "policies": [
    {
      "table_name": "entity_table",
      "public_fields": ["id", "title", "description"]
    }
  ]
}
```

```json
{
  "id": "wallet.create_invoice_public",
  "description": "Create incoming Lightning invoices from public sources.",
  "policies": [
    {
      "table": "entity_table",
      "wallet_field": "wallet_id"
    }
  ]
}
```

```json
{
  "id": "extension.api.request",
  "description": "Call an allow-listed installed extension API.",
  "policies": [
    {
      "id": "{target_extension}",
      "access": ["read"]
    }
  ]
}
```

```json
{
  "id": "http.request",
  "description": "Call an allow-listed external HTTPS origin.",
  "policies": [
    {
      "hosts": ["https://api.example.com"]
    }
  ]
}
```

Do not add a permission unless the extension actually calls the matching host
API.

## Payment Flows

Public invoice flow:

1. Public page reads allow-listed source data with `storage.getPublic`.
2. Public page calls a public extension API route.
3. WASM calls `wallet.createInvoicePublic({sourceId, amount, currency, memo})`.
4. LNbits core finds the source row, reads the configured `wallet_field`, and
   creates the invoice.
5. If configured, LNbits dispatches `events.onInvoicePaid` when the invoice is
   paid.
6. The event export updates extension storage.

The public page must not choose the wallet id directly. The wallet comes from
extension storage and the `wallet.create_invoice_public` policy.

Authenticated payment flow:

1. Authenticated page lists user wallets with `wallet.list`.
2. WASM reads balances or creates invoices only after checking that permissions
   and route auth require a user context.
3. WASM validates amounts, invoices, and target records before making wallet
   calls.
4. If outgoing payment is needed, WASM calls `wallet.pay_invoice` only from an
   authenticated route/export.
5. WASM stores status updates in extension-owned storage.

Never expose outgoing payment capability or wallet balance data to public
routes.

## Build

JavaScript components are commonly bundled and componentized with `jco`.

Example JavaScript build flow:

```bash
cd lnbits/extensions/{ext_id}/dev
npm run check
npm run build:wasm
```

Rust components are commonly compiled with `cargo component`.

Example Rust build flow:

```bash
cd lnbits/extensions/{ext_id}/dev
cargo component build --release --target wasm32-wasip1
cp target/wasm32-wasip1/release/{component_name}.wasm ../wasm/module.wasm
```

If exports, host imports, WIT definitions, or backend logic change, rebuild
`wasm/module.wasm`.

## Adding A Feature

1. Update storage schema/migrations if data shape changes.
2. Add or update WASM export code in `dev/src/index.js` for JavaScript or
   `dev/src/lib.rs` for Rust.
3. Add host helper wrappers only when the language SDK needs them.
4. Add or update `config.json` exports, routes, events, and permissions.
5. Update `ui/*.html`, `static/*.js`, and `static/app.css` for browser behavior.
6. Rebuild `wasm/module.wasm`.
7. Validate JSON and run the closest relevant tests/checks.

## Validation

Useful checks:

```bash
python -m json.tool lnbits/extensions/{ext_id}/config.json
python -m json.tool lnbits/extensions/{ext_id}/storage/schema.json
cd lnbits/extensions/{ext_id}/dev && npm run check
cd lnbits/extensions/{ext_id}/dev && npm run build:wasm
cd lnbits/extensions/{ext_id}/dev && cargo component build --release --target wasm32-wasip1
```

Use the JavaScript or Rust build command that matches the extension. If
core-facing config changed, reinstall or reload the extension in LNbits before
manual testing.

For core changes that affect all WASM extensions, prefer generic fixture-based
tests that create a synthetic WASM extension under a temporary extension root.
Do not depend on a specific bundled example being installed during tests.

## Design Rules

- Keep LNbits core extension-agnostic.
- Keep public pages unauthenticated, not untrusted-by-default.
- Use explicit config fields; avoid fallback names or hidden conventions.
- Public data must be allow-listed.
- Browser UI must go through the sandbox bridge.
- WASM code must go through host functions and declared permissions.
- Do not expose access tokens, wallet ids, owner ids, or raw private storage in
  public responses.
- Keep generated files generated; change source and rebuild.
