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
   - Angular source compiler
   - TUI model compiler
   - future: Vue, native mobile, CLI forms, screenshots/tests

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
