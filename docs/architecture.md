# Architecture

## Core idea

Open UI IR is a compiler boundary, not a React component library. The IR carries
intent: resources, routes, filters, actions, layout, data bindings, and renderer
constraints. Framework targets decide how to materialize that intent.

## Layers

1. Protocol
   - JSON-compatible TypeScript types
   - AIP-shaped list contracts
   - keyset pagination token model
2. Compiler core
   - validates protocol invariants
   - dispatches to a target adapter
   - reports diagnostics with stable paths
3. Targets
   - React AntD source compiler
   - React Material UI source compiler
   - Angular source compiler
   - Android native target model
   - TUI model compiler
   - future: Vue, native mobile, CLI forms, screenshots/tests

## General framework

The long-term design splits the protocol into semantic IR, presentation IR,
interaction IR, and data-binding IR. Target adapters lower those IR layers into
specific runtimes and UI libraries. React AntD, React Material UI, Angular,
Android, and TUI should all be peers in the target layer, not concepts embedded
inside the protocol.

See `docs/general-framework-design.md`.

## Pagination rule

Public APIs expose `page_size`, `page_token`, and `next_page_token`. Database
implementations should use keyset pagination internally. If the visible sort key
is not unique, append a stable resource `name` or primary key to the internal
ordering.

Example:

```sql
ORDER BY last_enriched_at DESC, name ASC
```

The page token stores the last row's full key tuple, not an offset.
