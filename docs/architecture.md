# Architecture

## Core Idea

Open UI IR is a compiler boundary, not a React component library. The IR carries
target-neutral intent: resources, routes, filters, actions, layout, data
bindings, mobile hints, and renderer constraints. Framework targets decide how
to materialize that intent.

The protocol must not import or depend on concrete UI libraries. AntD, Mantine,
Angular, terminal, and future native targets live at the target layer.

## Layers

1. Protocol
   - JSON-compatible TypeScript types
   - JSON Schema wire contract
   - AIP-shaped list contracts
   - keyset pagination token model
   - target-neutral table/detail mobile hints
2. Compiler core
   - validates protocol invariants
   - validates cross-references such as fields, actions, bindings, and mobile
     hint fields
   - validates a document against target capability manifests
   - dispatches to a target adapter
   - reports diagnostics with stable paths
3. Targets
   - React AntD source compiler
     - emits AntD TSX
     - lowers chart intent to `@ant-design/charts`
     - emits responsive mobile card fallback for table mobile hints
   - React Mantine source compiler
     - emits Mantine TSX
     - lowers supported chart intent to `@mantine/charts`
     - preserves unsupported chart intents as explicit Mantine cards
     - emits responsive mobile card fallback for table mobile hints
   - Angular source compiler
   - TUI model compiler
   - future: React MUI, React Chakra, native mobile, CLI forms, screenshots/tests
4. Tooling
   - CLI validation and compilation
   - demo-suite contract coverage
   - package boundary tests

## Package Boundary

Frontend bundles should load only the selected renderer package:

- Mantine apps import `@open-ui-ir/react-mantine` and install Mantine peers.
- AntD apps import `@open-ui-ir/react-antd` and install AntD peers.
- Shared packages such as `@open-ui-ir/protocol` and
  `@open-ui-ir/compiler-core` must not depend on AntD, Mantine, or other UI
  libraries.

The CLI can support many targets, but it lazy-loads the selected target. Running
`open-ui-ir compile --target react-mantine` dynamically imports only the
Mantine target; `--target react-antd` dynamically imports only the AntD target.

See `docs/package-system.md`.

## General Framework

The long-term design splits the protocol into semantic IR, presentation IR,
interaction IR, and data-binding IR. Target adapters lower those IR layers into
specific runtimes and UI libraries. React AntD, React Mantine, Angular, Android,
and TUI should all be peers in the target layer, not concepts embedded inside
the protocol.

See `docs/general-framework-design.md`.

## Pagination Rule

Public APIs expose `page_size`, `page_token`, and `next_page_token`. Database
implementations should use keyset pagination internally. If the visible sort key
is not unique, append a stable resource `name` or primary key to the internal
ordering.

Example:

```sql
ORDER BY last_enriched_at DESC, name ASC
```

The page token stores the last row's full key tuple, not an offset.

## Visualization Rule

Chart semantics live in the protocol as target-neutral `chart` components:
`line`, `bar`, `area`, `pie`, `heatmap`, `scatter`, `radar`, `rose`,
`radial_bar`, `funnel`, `treemap`, `word_cloud`, `gauge`, and `liquid`.

Concrete target adapters lower these intents to library-specific components
when a library has a matching primitive. For example, React AntD lowers chart
intent to `@ant-design/charts`; React Mantine lowers supported chart families to
`@mantine/charts` and keeps unsupported families visible as explicit chart
intent cards.

## Mobile Rule

Mobile support is currently target-neutral responsive intent, not native
Android/iOS output. Table and detail specs can declare optional `mobile` hints:

- tables can ask for card presentation with primary, secondary, and metadata
  fields
- details can ask for stacked or tabbed sections/related resources and sticky
  actions

Targets decide how to honor those hints. The React AntD and React Mantine
targets currently emit desktop tables plus narrow-screen card fallback for table
mobile hints.
