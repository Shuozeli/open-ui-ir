# Open UI IR Feature Contract

This document records the stable contract covered by examples and compiler
validation. The goal is to keep Open UI IR as a framework boundary instead of a
single hand-written demo renderer.

## Stable Surface

### Semantic Resource Model

- A document declares app metadata, capabilities, resource collections, and
  routes.
- Each collection is AIP-shaped and must expose a required `name` field.
- Collection fields declare value type, renderer kind, required status, and
  output-only status.
- Collections expose list/get bindings, filters, actions, and keyset pagination.

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

Table components declare `props.table` with:

- a collection reference
- explicit columns
- optional row navigation
- optional row actions
- optional bulk actions

Table columns bind to collection fields and declare labels, visibility,
sortable intent, width, and alignment. Sortable columns are currently limited to
fields that participate in the collection's keyset pagination ordering.

Detail header components declare `props.detail` with:

- a collection reference
- title, subtitle, and status fields
- detail actions
- field sections
- tabs that reference sections or related-resource panels
- related-resource panels with table contracts
- timeline intent with title, time, and optional description fields

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
controls, and let update actions declare how `$form.update_mask` is sent to the
backend.

The current stable form controls are:

- `text`
- `textarea`
- `number`
- `checkbox`
- `select`
- `multi_select`
- `date_time`
- `json`

### Data Binding Model

Bindings currently support `graphql` and `rest` transport declarations. A
binding declares an operation, a result path, and variable mappings. The binding
does not own the transport client implementation; each renderer or runtime owns
that lowering.

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
- component `data_ref` references to route bindings
- component `props.collection` references to collections
- table props, collection references, columns, sortable fields, row actions, and
  bulk actions
- detail props, header fields, actions, sections, tabs, related-resource panels,
  timeline fields, and nested data refs
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

These checks intentionally focus on stable contract integrity. They do not yet
validate every renderer-specific prop or infer every result-path shape.

## Target Manifests

Compiler targets can declare a `TargetManifest` through `CompilerTarget.manifest`.
The manifest records the target's supported layouts, component kinds, field
renderers, filter kinds, action methods, chart kinds, and transports.

`compileDocument` validates the document itself and then validates the document
against the target manifest when one is present. Targets may still compile with
diagnostics, but callers can now distinguish document contract errors from
target capability gaps before rendering or code generation.

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
- `open-ui-ir compile --target <react-antd|angular|tui> [--out <dir>] [--json] <file>`

Validation returns a non-zero exit code when diagnostics are present. Compile
also validates target compatibility before writing files.

## Next Contract Work

The next contract additions should happen in this order:

1. GraphQL/OpenAPI introspection input that can generate initial IR documents.
2. Runtime renderer conformance tests for pushed UI documents.
