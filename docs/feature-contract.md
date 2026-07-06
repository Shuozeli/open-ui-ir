# Open UI IR Feature Contract

This document records the stable contract covered by examples and compiler
validation. The goal is to keep Open UI IR as a framework boundary instead of a
single hand-written demo renderer.

The machine-readable wire shape is published at
`schemas/open-ui-ir.v1.schema.json`. The JSON Schema validates structural
shape, while `@open-ui-ir/compiler-core` performs semantic cross-reference and
target-compatibility checks.

For a field-by-field list of supported value types, binding values, layouts,
components, filters, actions, metric formats, and chart encodings, see
`docs/ir-format.md`.

## Stable Surface

### Semantic Resource Model

- A document declares app metadata, capabilities, resource collections, and
  routes.
- Each collection is AIP-shaped and must expose a required `name` field.
- Collection fields declare value type, renderer kind, required status, and
  output-only status.
- Collections expose list/get bindings, filters, actions, and keyset pagination.
- Routes, collections, fields, and actions may declare auth requirements for UI
  affordance filtering.

### Presentation Model

The current stable layouts are:

- `crud_list`
- `detail_page`
- `dashboard`

The current stable component kinds are:

- `filter_bar`
- `table`
- `detail_header`
- `metric_row`
- `chart`
- `chart_grid`

The current stable chart intents are:

- `line`
- `bar`
- `area`
- `pie`
- `heatmap`
- `scatter`
- `radar`
- `rose`
- `radial_bar`
- `funnel`
- `treemap`
- `word_cloud`
- `gauge`
- `liquid`

Table components declare a direct `table` object with:

- a collection reference
- explicit columns
- optional row navigation
- optional row actions
- optional bulk actions
- optional mobile presentation hints for card rendering, primary/secondary
  fields, metadata fields, and action display

Table columns bind to collection fields and declare labels, visibility,
sortable intent, width, and alignment. Sortable columns are currently limited to
fields that participate in the collection's keyset pagination ordering.

Detail header components declare a direct `detail` object with:

- a collection reference
- title, subtitle, and status fields
- detail actions
- field sections
- tabs that reference sections or related-resource panels
- related-resource panels with table contracts
- timeline intent with title, time, and optional description fields
- mobile presentation hints for stacked/tabs sections, related resources, and
  sticky actions

### Interaction Model

The current stable action methods are:

- `get`
- `create`
- `update`
- `delete`
- `custom`

Actions are declarative bindings. Renderers decide whether an action becomes a
button, modal, confirmation dialog, keyboard command, or terminal action.

Action interactions declare target-neutral lifecycle behavior:

- confirmation copy, including destructive confirmations
- submit presentation, pending copy, and pending disable policy
- success/failure outcome copy
- optimistic update intent

Tables with bulk actions declare a selection policy. Bulk actions currently
require multiple selection with `required_for_bulk_actions: true`.

Create and update actions declare form schemas through `action.form`. Form
schemas bind editable fields back to collection fields, choose target-neutral
controls, and let update actions declare a typed `{ kind: "form", path:
"update_mask" }` binding for backend update-mask variables.

The current stable form controls are:

- `text`
- `textarea`
- `number`
- `checkbox`
- `select`
- `multi_select`
- `date_time`
- `json`

### Auth Model

Auth metadata is part of the stable alpha surface for describing UI intent. It
does not enforce backend security.

The current requirement kinds are:

- `public`
- `authenticated`
- `permission`
- `role`
- `all`
- `any`

Auth metadata can be attached to:

- routes through `route.auth.requirement`, with optional `fallback`,
  `denied_message`, and `unauthorized`
- collections through `collection.auth.read`
- fields through `field.auth.read`, `field.auth.write`, and `field.auth.unauthorized`
- actions through `action.auth.invoke` and `action.auth.unauthorized`

Supported unauthorized presentations are intentionally surface-specific:

| Surface | Supported values |
|---------|------------------|
| Route | `hide`, `deny` |
| Field | `hide`, `redact` |
| Action | `hide`, `disable` |

`@open-ui-ir/compiler-core` also exports a target-neutral `can(requirement,
context)` helper. React AntD and React Mantine generated output accepts an
`authContext` prop, renders direct-access denied states for route auth, filters
table columns plus mobile card fields using field read requirements, and hides
or disables generated action buttons using action invoke requirements.

### Data Binding Model

Bindings currently support `graphql` and `rest` transport declarations. A
binding declares an operation, a typed `result.path`, and typed variable
mappings such as `{ kind: "route", path: "name" }`, `{ kind: "resource", path:
"name" }`, `{ kind: "form" }`, `{ kind: "page", path: "page_size" }`, and
`{ kind: "filters" }`. The binding does not own the transport client
implementation; each renderer or runtime owns that lowering.

## Validator Guarantees

`@open-ui-ir/compiler-core` validates:

- document protocol version
- duplicate route paths
- duplicate collection names
- unsupported layouts
- unsupported component kinds
- unsupported filter kinds
- unsupported field renderer kinds
- unsupported action methods
- missing required resource `name` fields
- filter field references
- keyset pagination field references
- keyset pagination unique tie-breaker fields
- duplicate route data binding names
- component `data.binding` references to route bindings
- component collection references to collections
- table objects, collection references, columns, sortable fields, row actions,
  bulk actions, and mobile field hints
- detail objects, header fields, actions, sections, tabs, related-resource panels,
  timeline fields, mobile hints, and nested data refs
- interaction lifecycle for submit behavior, outcomes, destructive
  confirmations, optimistic updates, and bulk-action selection policy
- chart props, chart kind, and non-empty chart encoding
- target manifests against document requirements, including layouts,
  components, field renderers, filters, actions, chart kinds, and transports
- create/update action form schemas
- form field references, duplicate fields, output-only fields, and incompatible
  field/control pairs
- create forms covering required mutable fields
- update form `update_mask` binding
- auth requirement shape, including known requirement kinds, non-empty
  permission/role strings, non-empty `all`/`any` groups, surface-specific
  unauthorized presentations, and non-empty route fallback/denied messages

These checks intentionally focus on stable contract integrity. They do not yet
infer every transport result shape.

## Target Manifests

Compiler targets can declare a `TargetManifest` through `CompilerTarget.manifest`.
The manifest records the target's supported layouts, component kinds, field
renderers, filter kinds, action methods, chart kinds, and transports.

`compileDocument` validates the document itself and then validates the document
against the target manifest when one is present. Targets may still compile with
diagnostics, but callers can now distinguish document contract errors from
target capability gaps before rendering or code generation.

Current compiler targets:

| Target | Package | Notes |
|--------|---------|-------|
| `react-antd` | `@open-ui-ir/react-antd` | Emits AntD TSX and lowers charts to `@ant-design/charts`. |
| `react-mantine` | `@open-ui-ir/react-mantine` | Emits Mantine TSX, lowers supported charts to `@mantine/charts`, and preserves unsupported chart intents as explicit cards. |
| `angular` | `@open-ui-ir/angular` | Emits Angular standalone component source. |
| `tui` | `@open-ui-ir/tui` | Emits a terminal screen model. |

The React targets also emit responsive mobile card fallback when a table declares
`table.mobile.presentation: "cards"`, and generated pages accept an `authContext`
prop for auth-aware route, field, and action rendering.

## Fixture Policy

The `examples/` directory is contract coverage, not just demo data:

- `product-catalog.ui.json` is the small baseline fixture.
- `all-features.ui.json` tracks the broad current feature surface.
- `full-crud.ui.json` is a non-domain-specific CRUD/dashboard fixture used to
  prevent the framework from becoming tied to the incident demo.

Every `*.ui.json` file must validate cleanly and compile to all current targets
in `@open-ui-ir/demo-suite`.

## CLI

`@open-ui-ir/cli` exposes the current contract checks and compiler targets:

- `open-ui-ir validate [--json] <file...>`
- `open-ui-ir compile --target <react-antd|react-mantine|angular|tui> [--out <dir>] [--json] <file>`

Validation returns a non-zero exit code when diagnostics are present. Compile
also validates target compatibility before writing files.

## Next Contract Work

The next contract additions should happen in this order:

1. Runtime renderer conformance tests for pushed UI documents.
2. GraphQL/OpenAPI introspection input that can generate initial IR documents.
3. Native mobile target modeling after the responsive mobile hints stabilize.
