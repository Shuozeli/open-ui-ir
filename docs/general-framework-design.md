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
workflow, activity-stream, and form experiences once while preserving each target's native
patterns.

## Non-Goals

- Pixel-perfect cross-platform rendering. Targets should feel native.
- Hiding all framework differences. Target adapters may expose optional
  target-specific capability maps.
- Replacing GraphQL, REST, or gRPC. Open UI IR binds to data contracts; it does
  not own the transport.
- Becoming a single component library. Component libraries are compiler targets.

## Runtime Architecture

The runtime architecture is server-pushed UI, not frontend-owned product logic.
The frontend ships as a stable renderer shell. Product teams and backend
services describe what to render by publishing a Spike/Open UI IR document
through GraphQL.

```text
Backend service
  |
  |-- GraphQL schema + resolvers
  |     - resources
  |     - list/get/create/update/delete/action operations
  |     - filter metadata
  |     - pagination contract
  |
  |-- uiSpike GraphQL query
        - routes
        - pages
        - layouts
        - fields
        - actions
        - charts
        - empty/error/loading states
        - i18n message catalog
        - bindings to GraphQL operations
  |
  v
Fixed frontend renderer
  |
  |-- fetches Spike/Open UI IR through GraphQL
  |-- renders routes and layouts from IR
  |-- executes GraphQL operations declared by IR
  |-- maps semantic widgets to target components
  |-- owns only generic renderer behavior
```

The frontend must not hard-code product-specific pages such as "incident
dashboard", "feed", or "job posting". It may hard-code generic renderers such
as `collection_page`, `detail_page`, `form`, `table`, `chart`, `action_bar`,
and `filter_bar`. The backend pushes the composition of those generic
renderers.

Rust is not a framework requirement. The current Rust demo backend exists only
to validate that a real backend can expose both GraphQL data operations and a
server-pushed UI document through GraphQL. A production service could be Rust,
Go, Java, TypeScript, Python, or anything else, as long as it publishes the same
GraphQL/data contract and Spike/Open UI IR contract.

The demo contract is intentionally GraphQL-only:

```graphql
query UiSpike {
  uiSpike
}

query IncidentPageData {
  incidentEvents(pageSize: 50) {
    incidentEvents { name title severity service acknowledged createdAt }
    nextPageToken
  }
  incidentDashboard { openCount criticalCount ackRate }
}
```

## Compile-Time Architecture

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
- row selection and bulk-selection policy
- optimistic update policy
- confirmation dialogs
- modal form submit lifecycle
- action submit lifecycle
- URL-synced filters
- pagination state
- keyboard shortcuts
- focus policy
- undo/redo where supported

This prevents the current class of bugs where an activity item looks clickable but
does not have a valid target action.

### 3.1 Internationalization IR

Internationalization must distinguish three categories:

- **UI chrome**: route titles, button labels, filter labels, metric labels,
  validation messages, empty states, and action results. These are translated by
  message keys or fallback source strings in the IR message catalog.
- **Domain enum values**: stable coded values such as `critical`, `api`, or
  `batch-worker`. These should render through option/display-label maps, then
  pass through the message catalog.
- **User data**: user-entered titles, descriptions, external URLs, and arbitrary
  JSON payloads. These must not be machine-translated by the renderer by default.
  If localized user data is required, the data contract should expose localized
  fields or a server-side localization operation.

Locale-aware formatting for dates, numbers, currency, percentages, and duration
belongs in the renderer runtime, but the requested locale comes from IR metadata
or user preference.

### 4. Data Binding IR

Data binding describes how UI state maps to data operations:

- GraphQL operation + variables
- REST resource path + query/body
- gRPC method + request shape
- static fixture for tests
- polling or subscription policy
- result paths
- error mapping

Open UI IR should keep data fetching declarative so targets can compile to
React Query, Angular services + signals, Android repositories, or TUI async
loaders.

At runtime, the binding is also the boundary between product logic and renderer
logic. The backend decides which GraphQL operation powers a page, which fields
are selectable or filterable, and which mutation an action invokes. The frontend
renderer only interprets that binding.

Example runtime binding:

```json
{
  "id": "incident_events.list",
  "transport": "graphql",
  "operation": "query IncidentEvents($pageSize: Int, $pageToken: String, $filter: String) { incidentEvents(pageSize: $pageSize, pageToken: $pageToken, filter: $filter) { incidentEvents { name title severity status createdAt } nextPageToken } }",
  "result": { "path": "incidentEvents.incidentEvents" },
  "variables": {
    "pageSize": { "kind": "page", "path": "page_size" },
    "pageToken": { "kind": "page", "path": "page_token" },
    "filter": { "kind": "filters" }
  },
  "pagination": {
    "next_page_token_path": "incidentEvents.nextPageToken"
  }
}
```

### 4.1 Renderer Debug Runtime

The fixed frontend renderer should expose a small debug runtime on `window` so
operators can inspect what the backend pushed and drive the renderer from the
browser console. This debug runtime is a renderer capability, not product
business logic.

The global binding should use a stable name:

```ts
window.__OPEN_UI_IR_DEBUG__
```

The debug runtime has three goals:

- inspect the server-pushed UI Spike without digging through React internals
- inspect data binding metadata and result shapes without logging real user data
- drive renderer state from the console, such as opening a route, panel, action,
  or selected resource

It must not expose raw row payloads by default. Data debugging should report
operation names, binding ids, result paths, counts, field names, pagination
tokens, loading/error state, and timestamps. If a future renderer needs raw data
inspection, that should require an explicit opt-in flag for local development.

Proposed console API:

```ts
interface OpenUiIrDebugRuntime {
  version: "open-ui-ir.debug.v1";

  inspect(): DebugSnapshot;
  uiSpike(): OpenUiDocument | null;
  uiSummary(): UiSpikeSummary;
  dataSummary(): DataBindingSummary[];
  routes(): RouteSummary[];
  actions(collectionName?: string): ActionSummary[];
  panels(route?: string): PanelSummary[];

  openRoute(route: string): void;
  openPanel(panelId: string): void;
  openAction(actionName: string): void;
  selectResource(name: string): void;
  setLocale(locale: string): void;
  setFilter(name: string, value: unknown): void;
  clearFilters(): void;

  subscribe(listener: (snapshot: DebugSnapshot) => void): () => void;
}
```

Example console usage:

```js
__OPEN_UI_IR_DEBUG__.uiSummary()
__OPEN_UI_IR_DEBUG__.dataSummary()
__OPEN_UI_IR_DEBUG__.routes()
__OPEN_UI_IR_DEBUG__.actions("incidentEvents")
__OPEN_UI_IR_DEBUG__.openRoute("/incidents/dashboard")
__OPEN_UI_IR_DEBUG__.openAction("create")
__OPEN_UI_IR_DEBUG__.selectResource("incidents/inc-1002")
```

The `DebugSnapshot` should be intentionally small:

```ts
interface DebugSnapshot {
  active_route: string;
  active_panel?: string;
  active_action?: string;
  selected_resource_name?: string;
  locale: string;
  ui_spike: UiSpikeSummary;
  data_bindings: DataBindingSummary[];
  renderer_state: {
    filters: Record<string, unknown>;
    loading_bindings: string[];
    failed_bindings: Array<{ binding: string; message: string }>;
  };
}
```

`DataBindingSummary` must summarize data without leaking data rows:

```ts
interface DataBindingSummary {
  name: string;
  transport: "graphql" | "rest" | "grpc" | "static";
  operation: string;
  result_path: string;
  variables_shape: string[];
  result_shape: string[];
  row_count?: number;
  next_page_token_present?: boolean;
  last_loaded_at?: string;
}
```

Implementation plan for the React renderer:

1. Add a `createDebugRuntime()` helper that receives getter functions for the
   current document, route, selected resource, filters, action modal, and data
   binding summaries.
2. Register the runtime from a React effect after the renderer has mounted:
   `window.__OPEN_UI_IR_DEBUG__ = runtime`.
3. Keep mutable renderer state in refs so console calls always see the newest
   state without forcing React re-renders.
4. Route-driving methods call the same renderer commands as UI interactions:
   `openRoute()` updates the hash route, `openAction()` invokes the pushed
   action definition, and `openPanel()` updates generic panel state when the
   active layout supports panels.
5. Data loaders record only summaries: operation, result path, field names,
   count, pagination presence, load time, and error message.

This gives a clean debugging boundary: if a rendered button or panel is wrong,
first inspect the pushed Spike and binding summaries. If the Spike is correct,
the bug is in the renderer lowering layer. If the Spike is wrong, the bug is in
the backend pushdown contract.

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
  "resource": "products",
  "primary_action": "products.create",
  "filters": ["q", "status"],
  "row_navigation": "/products/{name}",
  "pagination": "keyset"
}
```

React AntD output:

- `Table`
- compact filter controls
- AntV / `@ant-design/charts` for chart intent
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

## Visualization Contract

Visualization is a presentation intent, not a dependency on a specific charting
library. The protocol should describe:

- chart kind: line, bar, area, pie, heatmap, scatter
- encodings: x, y, value, category, color, size
- data binding
- title and sizing hints
- stacking/smoothing hints

Target adapters decide how to render this:

- React AntD -> `@ant-design/charts`
- React MUI -> a MUI-compatible chart library or adapter
- Angular -> Angular chart adapter
- Android -> Compose chart target
- TUI -> compact ASCII/sparkline/summary model

## Validation Rules

The validator should fail documents that:

- omit resource `name`
- use keyset pagination without a unique ordered key
- reference components unsupported by the selected target
- define clickable UI without an action or route target
- bind a component to a missing data reference
- reference filters that cannot be represented in the data binding
- use undeclared target-specific component fields in semantic IR

## Roadmap

1. Split current `@open-ui-ir/protocol` into semantic/presentation/interaction
   modules while keeping the existing export surface stable.
2. Add target manifests and target capability validation.
3. Add React MUI as the second React UI-library target.
4. Add CLI: `open-ui-ir validate`, `open-ui-ir compile --target react-antd`.
5. Add Android target model with a generated Compose skeleton.
6. Add a non-domain-specific fixture set that exercises every stable IR feature.
