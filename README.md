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

See [docs/general-framework-design.md](docs/general-framework-design.md) for the
broader compiler architecture: semantic IR, presentation IR, interaction IR,
data-binding IR, and target lowering for multiple frameworks and UI libraries.

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
