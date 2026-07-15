# LNbits WASM Extension Agent Guide

This guide describes the expected structure of an LNbits WASM extension so AI
agents can create, review, or modify extensions with minimal guessing.

Use this file as the first source of truth when editing a WASM extension. If it
conflicts with `config.json`, `config.json` defines what LNbits actually loads.
If it conflicts with the source code, inspect the code before changing behavior.

## Directory Structure

Extensions are installed under `{LNBITS_EXTENSIONS_PATH}/extensions/{ext_id}`.
`LNBITS_EXTENSIONS_PATH` defaults to `./lnbits/`, but deployments often set it
to another directory such as `./data`. In this guide, `<extension-root>` means
the actual `{LNBITS_EXTENSIONS_PATH}/extensions/{ext_id}` directory. Paths in
`config.json` are always relative to that extension root.

```text
config.json                 # LNbits runtime contract
manifest.json               # extension repository listing metadata
wasm/
  module.wasm               # generated WASM component loaded by LNbits
  lnbits-extension.wit      # host/import/export interface
ui/
  admin.html                # configured private iframe entrypoint
  public.html               # configured public iframe entrypoint
static/
  admin.js                  # private page browser code
  public.js                 # public page browser code
  app.css                   # extension styling
  lnbits-extension-sdk.js   # browser postMessage bridge SDK
  assets/
    icon.png                # icon used by LNbits for WASM extensions
storage/
  schema.json               # current storage schema
  migrations/
    0001_*.json             # ordered storage migrations
dev/
  <language build files>    # package/toolchain files for the source language
  src/                      # extension source code
  sdk/ or bindings/         # optional language-specific host wrappers
  dist/ or target/          # generated build output; do not edit by hand
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

LNbits core UI assets used by iframe pages must be loaded through the approved
extension asset proxy, not through `/static`. Use
`/ext-assets/{ext_id}/_lnbits/{asset_name}` for approved shared assets such as
`bundle.min.css`, `material-icons.css`, `vue.global.prod.js`,
`quasar.umd.prod.js`, and `qrcode.vue.browser.js`.

Development files:

- The source language and build tool are template-specific.
- Source code usually lives under `dev/src/`, but the exact layout is owned by
  the selected language template.
- Host wrappers or SDK bindings may live under `dev/sdk/`, `dev/bindings/`, or
  another template-defined path.
- Generated build output under `dev/dist/`, `dev/target/`, or language build
  directories should only be edited by the build tool.
- `wasm/module.wasm` is generated. Change source under `dev/`, then rebuild.
- `static/admin.html`, `static/public.html`, and `static/index.html` may exist
  for compatibility or older layouts. The active iframe entrypoints are the
  files referenced by `ui_routes[*].entrypoint`.

## Editing Rules For Agents

- Keep changes inside the extension unless the user explicitly asks for LNbits
  core changes.
- Do not edit generated files by hand: `wasm/module.wasm`, `dev/dist/*`, build
  cache folders, or package lockfiles unless the build command updates them.
- If backend behavior changes, edit the language source under `dev/` and
  rebuild `wasm/module.wasm`.
- If host functions are needed, add or update a thin wrapper in the
  language-specific SDK/bindings layer instead of scattering raw host imports
  through business logic.
- If browser behavior changes, edit `static/admin.js`, `static/public.js`,
  `static/app.css`, or the configured files under `ui/`.
- Browser JS must be compatible with the sandbox iframe CSP. Do not introduce
  runtime template compilation, `eval`, `new Function`, inline event handlers,
  or other code paths that require `unsafe-eval`.
- The iframe sandbox does not grant `allow-forms`. Do not use native `<form>`
  submission or submit buttons in extension iframe pages. Use inert containers
  and `type="button"` controls, then handle actions through JavaScript and the
  bridge SDK.
- If routes, exports, events, permissions, or public fields change, update
  `config.json`.
- If stored data shape changes, update `storage/schema.json` and add a new
  migration file. Do not edit old migrations for already released versions.
- Keep public pages public: no account-only data, balances, outgoing payments,
  raw wallet ids, owner ids, API keys, or access tokens in public responses.

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

Do not put build-only metadata in `config.json` unless LNbits core consumes it.
Build commands belong to the selected language template, for example in a
toolchain file, a Makefile, or developer docs.

## WASM Exports

Each entry in `wasm.exports` must match an export in `wasm/lnbits-extension.wit`
and the compiled `wasm/module.wasm`.

Language toolchains may map WIT names to source-language function names. Do not
guess the mapping. Follow the selected language template and make sure the final
compiled component exports the WIT names declared in `config.json`.

When adding an export, update all required contract points:

1. `wasm.exports` in `config.json`.
2. The `export ...` line in `wasm/lnbits-extension.wit`.
3. The matching source-language function or method under `dev/`.
4. The route or event entry that invokes the export, if any.

Visibility values:

- `authenticated`: callable only with an authenticated LNbits account.
- `public`: callable from public extension pages.
- `event`: callable by LNbits background/event dispatch.

Exports should follow this runtime shape:

```text
exported_function(request_json: string) -> string
```

Every export should return a JSON string with a consistent `{ok, data, error}`
envelope. Keep envelope creation in shared helpers where the language template
supports it, so validation failures become safe, predictable responses.

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

Do not load LNbits core browser files directly from `/static` inside extension
HTML. Shared LNbits assets must use
`/ext-assets/{ext_id}/_lnbits/{asset_name}` so the frame CSP can remain narrow
and extension pages do not depend on the full LNbits app page context.

Use the browser bridge SDK shipped by the extension template instead of raw
`fetch()` for extension API calls. The SDK should use the parent wrapper bridge,
check message sources, and keep the iframe sandbox model intact.

Do not rely on LNbits cookies inside the iframe. The iframe may be sandboxed
without same-origin cookie access.

The iframe CSP intentionally does not allow `unsafe-eval`. Do not use Vue
runtime templates such as `Vue.createApp({ template: "..." })`, DOM APIs that
compile strings as code, `eval`, `new Function`, or inline `onclick`/event
handler attributes. If using Vue in iframe pages, use render functions,
precompiled templates, or the template pattern already used by the selected
extension scaffold. Plain DOM rendering is also fine.

The iframe sandbox intentionally does not allow native form submission. Avoid
`<form>` elements, submit buttons, and submit event workflows in extension UI.
Use `<div>` containers, explicit `type="button"` buttons, and JavaScript click
handlers that call the extension bridge instead.

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
- `http`: allow-listed external HTTP requests.

The host enforces permissions and owner scoping. Do not store LNbits user ids,
access tokens, or owner ids in extension data; LNbits core owns isolation.

Import raw host functions only in the language-specific SDK/bindings layer.
Extension business logic should call wrapper methods such as `storage`,
`wallet`, `extension`, `http`, `system`, and `utils` rather than binding
directly to low-level host imports everywhere.

## Storage

Define storage in `storage/schema.json`.

Rules:

- Every table needs an `id` field.
- Use migrations for changes after the initial schema.
- Use snake_case field names in storage rows.
- Public data must be explicitly exposed through `ext.storage.read_public`.
- Do not expose wallet ids or private operational fields through public fields.
- Do not write or query reserved internal owner fields.
- Authenticated storage calls are scoped by LNbits to the current user.
- Public storage reads are item-by-id only and return only allow-listed fields.

Storage is accessed from WASM through the language SDK:

```text
storage.set(table, data)
storage.get(table, id)
storage.get_public(table, id)
storage.get_paginated(table, filters, search, sort, pagination)
```

Use storage schemas as the source of truth. Reject unknown fields before storing
records, and keep public response objects small.

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
- `http.request`: call allow-listed external HTTPS origins from authenticated
  WASM exports.
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
      "host": "https://api.example.com"
    }
  ]
}
```

Do not add a permission unless the extension actually calls the matching host
API.

For `ext.storage.read_public`, policy entries must use:

- `table_name`: the table that public pages may read by id.
- `public_fields`: fields that may be returned to public pages.

Do not expose `wallet_id`, `wallet_name`, `watchonly_wallet_id`,
`watchonly_wallet_name`, `slug`, `created_at`, or `updated_at` publicly unless
there is a deliberate product and security reason.

For `wallet.create_invoice_public`, policy entries must use:

- `table`: the table that contains the public source record.
- `wallet_field`: the field on that table containing the wallet id.

Public pages pass `sourceId`; they do not pass wallet ids.

For `extension.api.request`, policy entries must use:

- `id`: target extension id.
- `access`: `["read"]`, `["write"]`, or both.

For `http.request`, each policy entry must be either an HTTPS origin string or
an object with a `host` field. The host policy is origin-based, so a policy for
`https://api.example.com` allows requests to that origin, not arbitrary hosts.

Outbound HTTP constraints:

- URLs must use `https`.
- URL credentials are rejected.
- Localhost and internal/private network addresses are rejected.
- Redirects are not followed.
- Request bodies are capped at 65,536 bytes.
- Response bodies are capped at 262,144 bytes.
- Timeout is 10 seconds.
- Hop-by-hop and sensitive headers such as `cookie`, `host`, `content-length`,
  and `set-cookie` are stripped.

Use `http.request` only for small server-side API calls that are safe to proxy
through the WASM host. Browser UI should still use the sandbox bridge for
extension API calls.

## Payment Flows

Public invoice flow:

1. Public page reads allow-listed source data with `storage.get_public`.
2. Public page calls a public extension API route.
3. WASM calls `wallet.create_invoice_public(source_id, amount, currency, memo)`.
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

Build steps are owned by the selected language template. The build must produce
`wasm/module.wasm` as a WebAssembly component that matches
`wasm/lnbits-extension.wit`.

Generic build flow:

```bash
cd <extension-root>/dev
<language-check-command>
<language-build-command>
```

Use the toolchain declared by the selected template. The only required output is
a WASM component compatible with the WIT file.

If exports, host imports, WIT definitions, dependencies, or backend logic
change, rebuild `wasm/module.wasm`.

## Adding A Feature

1. Update storage schema/migrations if data shape changes.
2. Add or update WASM export code in the language source under `dev/`.
3. Add host helper wrappers only when the language SDK/bindings layer needs
   them.
4. Add or update `config.json` exports, routes, events, and permissions.
5. Update `ui/*.html`, `static/*.js`, and `static/app.css` for browser behavior.
6. Rebuild `wasm/module.wasm`.
7. Validate JSON and run the closest relevant tests/checks.

## Validation

Useful checks:

```bash
python -m json.tool <extension-root>/config.json
python -m json.tool <extension-root>/storage/schema.json
cd <extension-root>/dev && <language-check-command>
cd <extension-root>/dev && <language-build-command>
```

Use the check and build commands from the selected language template. If
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
