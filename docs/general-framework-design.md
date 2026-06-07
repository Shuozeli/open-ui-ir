# General Framework Design

## Goal

Open UI IR should be a general middle-layer UI compiler framework. It should not
be a React DSL, an Ant Design wrapper, or a dashboard-only protocol. The core
contract describes product intent once, then target compilers lower that intent
into different runtimes and UI libraries:

- React + Ant Design
- React + Material UI
- React + headless components
- Angular
- Vue
- Android native
- iOS native
- terminal UI
- server-rendered HTML
- custom embedded renderers

The framework should let a product team define CRUD, dashboard, detail, wizard,
workflow, feed, and form experiences once while preserving each target's native
patterns.

## Non-Goals

- Pixel-perfect cross-platform rendering. Targets should feel native.
- Hiding all framework differences. Target adapters may expose optional
  target-specific capability maps.
- Replacing GraphQL, REST, or gRPC. Open UI IR binds to data contracts; it does
  not own the transport.
- Becoming a single component library. Component libraries are compiler targets.

## Architecture

```text
Domain schema / GraphQL / OpenAPI / YAML / code
                 |
                 v
        Open UI Semantic IR
                 |
         validation + planning
                 |
                 v
       Target-independent UI Plan
                 |
       target lowering adapters
                 |
  React AntD | React MUI | Angular | Android | iOS | TUI
```

## Layers

### 1. Semantic IR

The semantic layer describes what the UI means:

- resources and resource names
- list/get/create/update/delete/action methods
- fields and field semantics
- filters, sort order, pagination
- validation constraints
- routes and navigation
- workflows and transitions
- data bindings
- authorization/capability constraints

This layer should be JSON-compatible and stable. It is the contract that servers
can push and tools can inspect.

### 2. Presentation IR

The presentation layer describes UI intent without naming a concrete library:

- list view
- detail page
- table/grid/card-list
- filter bar
- form
- action bar
- tabs
- split panes
- wizard stepper
- dashboard section
- metric row
- chart intent
- empty/error/loading states

Presentation IR can express density, priority, grouping, responsive behavior,
and accessibility intent. It should not contain AntD, MUI, Angular Material, or
Android class names.

### 3. Interaction IR

Interaction IR describes behavior that must compile consistently:

- route transitions
- row navigation
- optimistic update policy
- confirmation dialogs
- action submit lifecycle
- URL-synced filters
- pagination state
- keyboard shortcuts
- focus policy
- undo/redo where supported

This prevents the current class of bugs where a feed item looks clickable but
does not have a valid target action.

### 4. Data Binding IR

Data binding describes how UI state maps to data operations:

- GraphQL operation + variables
- REST resource path + query/body
- gRPC method + request shape
- local fixture for tests
- polling or subscription policy
- result paths
- error mapping

Open UI IR should keep data fetching declarative so targets can compile to
React Query, Angular services + signals, Android repositories, or TUI async
loaders.

### 5. Target Lowering

A target adapter lowers semantic/presentation/interaction/data IR into a
concrete runtime.

Target adapters own:

- file layout
- imports
- component library mapping
- state management library
- query/data-fetching runtime
- routing runtime
- platform-specific accessibility APIs
- style/theme translation

Target adapters must report diagnostics when they cannot support a capability.
They should not silently drop behavior.

## Target Model

Each target declares a capability manifest:

```ts
interface TargetManifest {
  id: string;
  runtime: "react" | "angular" | "android" | "ios" | "tui" | "html";
  ui_library?: "antd" | "mui" | "chakra" | "angular-material";
  supports: {
    layouts: string[];
    components: string[];
    interactions: string[];
    data_transports: string[];
  };
}
```

Compilation is a two-step process:

1. Normalize source document into canonical IR.
2. Lower canonical IR with a target manifest and target adapter.

## Package Plan

Current packages:

- `@open-ui-ir/protocol`
- `@open-ui-ir/compiler-core`
- `@open-ui-ir/react-antd`
- `@open-ui-ir/angular`
- `@open-ui-ir/tui`

General framework packages to add:

- `@open-ui-ir/semantic-ir`
- `@open-ui-ir/presentation-ir`
- `@open-ui-ir/interaction-ir`
- `@open-ui-ir/data-binding`
- `@open-ui-ir/target-react`
- `@open-ui-ir/react-mui`
- `@open-ui-ir/react-chakra`
- `@open-ui-ir/angular-material`
- `@open-ui-ir/android`
- `@open-ui-ir/validator`
- `@open-ui-ir/cli`

## Example Lowering

Input semantic intent:

```json
{
  "kind": "collection_page",
  "resource": "jobPostings",
  "primary_action": "jobPostings.create",
  "filters": ["q", "status"],
  "row_navigation": "/jobs/postings/{name}",
  "pagination": "keyset"
}
```

React AntD output:

- `Table`
- compact filter controls
- React Router navigation
- TanStack Query loader

React MUI output:

- `DataGrid` or `Table`
- MUI `TextField` / `Select`
- React Router navigation
- TanStack Query loader

Angular output:

- standalone component
- Angular service for data binding
- Router navigation
- signals or RxJS loader

Android output:

- Compose `LazyColumn`
- Material3 filter chips/search field
- ViewModel repository loader
- navigation route

TUI output:

- list/table screen model
- key bindings
- async command runner

## Pagination Contract

All list-like resources expose Google AIP-style pagination:

- request: `page_size`, `page_token`
- response: `next_page_token`

The token is opaque to clients. Database-backed implementations should use
keyset pagination, not offsets. The token carries the full ordered key tuple and
a request fingerprint for parent/filter/order stability.

If the visible order key is not unique, the compiler/validator must require a
stable tie-breaker such as `name`.

## Validation Rules

The validator should fail documents that:

- omit resource `name`
- use keyset pagination without a unique ordered key
- reference components unsupported by the selected target
- define clickable UI without an action or route target
- bind a component to a missing data reference
- reference filters that cannot be represented in the data binding
- use target-specific props in semantic IR

## Roadmap

1. Split current `@open-ui-ir/protocol` into semantic/presentation/interaction
   modules while keeping the existing export surface stable.
2. Add target manifests and target capability validation.
3. Add React MUI as the second React UI-library target.
4. Add CLI: `open-ui-ir validate`, `open-ui-ir compile --target react-antd`.
5. Add Android target model with a generated Compose skeleton.
6. Backport the dragbv2 UI document into the generalized IR as a real fixture.
