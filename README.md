# open-ui-ir

Renderer-neutral UI intermediate representation and compiler targets.

`open-ui-ir` defines a middle layer above framework-specific UI code. Servers or
tools emit one JSON document that describes resources, filters, actions, routes,
layouts, and data bindings. Compiler targets turn that document into React AntD,
React Material UI, Angular, Android, TUI models, or other renderers.

## Why

Most CRUD and dashboard UIs repeat the same structure:

- AIP-style resources with `name`, `page_size`, `page_token`, and
  `next_page_token`
- filter bars
- tables and detail pages
- charts and dashboard visualizations
- actions
- route/navigation metadata
- renderer-specific widgets

Instead of rebuilding this for each UI framework, `open-ui-ir` separates the
contract from the rendering layer.

```text
server schema / YAML / JSON / GraphQL
          |
          v
      Open UI IR
          |
    compiler targets
          |
 React AntD | React MUI | Angular | Android | TUI | custom renderer
```

## Packages

| Package | Purpose |
|---------|---------|
| `@open-ui-ir/protocol` | JSON-compatible protocol types and AIP/keyset pagination helpers |
| `@open-ui-ir/compiler-core` | validation and target-independent compiler orchestration |
| `@open-ui-ir/react-antd` | compiler target that emits React AntD source |
| `@open-ui-ir/angular` | compiler target that emits Angular standalone component source |
| `@open-ui-ir/tui` | compiler target that emits a terminal UI model |
| `@open-ui-ir/cli` | command-line validation and target compilation |

Visualization support currently includes target-neutral `chart` intent with
`line`, `bar`, `area`, `pie`, `heatmap`, and `scatter` chart kinds. The React
AntD target lowers these to `@ant-design/charts` components.

See [docs/general-framework-design.md](docs/general-framework-design.md) for the
broader compiler architecture: semantic IR, presentation IR, interaction IR,
data-binding IR, and target lowering for multiple frameworks and UI libraries.
See [docs/feature-contract.md](docs/feature-contract.md) for the current stable
feature surface, validator guarantees, and target manifest compatibility checks.

## Status

Early extraction from production server-driven UI work. The protocol is useful
for design and compiler experiments; renderer targets intentionally emit simple,
auditable outputs first.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

CLI examples:

```bash
pnpm --filter @open-ui-ir/cli open-ui-ir validate examples/product-catalog.ui.json
pnpm --filter @open-ui-ir/cli open-ui-ir compile --target react-antd --out generated examples/product-catalog.ui.json
```

## Demos

The `examples/` directory contains JSON IR demos that are validated and compiled
in CI by `@open-ui-ir/demo-suite`:

- `product-catalog.ui.json` -- compact CRUD + dashboard chart example.
- `all-features.ui.json` -- broader demo covering GraphQL-pushed UI/data bindings,
  keyset pagination, text/select/multi-select/date/boolean filters, get/create/
  update/delete/custom actions, i18n metadata, list/detail/dashboard routes,
  metrics, chart grid, and line/bar/area/pie/heatmap/scatter/radar/rose/
  radial-bar/funnel/treemap/word-cloud/gauge/liquid chart intent.
- `full-crud.ui.json` -- non-domain-specific CRUD/list/detail/dashboard fixture
  used to keep contract coverage independent from the incident demo.

`demo-backend/` is a Rust GraphQL demo backend that exposes both the UI Spike
document and the demo resource operations. `demo-ui/` is a fixed React AntD
renderer shell: it fetches the Spike through GraphQL, renders the pushed layout,
and executes the GraphQL bindings declared by the Spike. The demo demonstrates
action modals, row selection, detail navigation, dashboard charts, locale
switching, and the distinction between translated UI chrome, translated enum
labels, and untranslated user-entered data.
