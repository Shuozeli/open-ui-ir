# Open UI IR Format

This document is the human-readable companion to
`schemas/open-ui-ir.v1.schema.json`. The schema defines the wire shape; this
document explains what each supported format means.

## Document

An Open UI IR document has six required top-level sections:

| Field | Purpose |
|-------|---------|
| `protocol_version` | Must be `open-ui-ir.v1`. |
| `app_name` | Stable machine name for the app. |
| `display_name` | Human-facing app name. |
| `capabilities` | Declares the layouts, component kinds, renderers, filters, and actions used by the document. |
| `collections` | Resource contracts, fields, filters, actions, and pagination. |
| `routes` | Pages and their data bindings/components. |

Optional i18n fields:

| Field | Purpose |
|-------|---------|
| `default_locale` | Default BCP-47 locale, such as `en-US`. |
| `locales` | Available locale labels. |
| `messages` | Locale-keyed message catalog for UI chrome and enum labels. |

Optional auth metadata can appear on routes, collections, fields, and actions.
Auth metadata is UI intent only; backend services remain responsible for
enforcing every read and mutation.

## Collection Format

A collection describes a resource family. Current collections are AIP-shaped:
resources must expose a required `name` field, and list operations use
`page_size`, `page_token`, and `next_page_token`.

```json
{
  "name": "incidentEvents",
  "resource_type": "IncidentEvent",
  "plural_field": "incident_events",
  "auth": {
    "read": { "kind": "permission", "permission": "incidentEvents.read" }
  },
  "list": {
    "transport": "graphql",
    "operation": "incidentEvents",
    "result": { "path": "incidentEvents.incidentEvents" },
    "variables": {
      "page_size": { "kind": "page", "path": "page_size" },
      "page_token": { "kind": "page", "path": "page_token" },
      "filter": { "kind": "filters" }
    }
  },
  "fields": [],
  "filters": [],
  "actions": [],
  "pagination": {
    "kind": "keyset",
    "page_size_param": "page_size",
    "page_token_param": "page_token",
    "next_page_token_path": "nextPageToken",
    "order_by": [
      { "field": "created_at", "direction": "desc" },
      { "field": "name", "direction": "asc" }
    ],
    "unique_key_fields": ["name"]
  }
}
```

## Field Formats

Current `value_type` values:

| Value Type | Meaning |
|------------|---------|
| `string` | Text, enum-like strings, names, URLs. |
| `number` | Integer or floating numeric data. |
| `boolean` | True/false data. |
| `datetime` | Date-time string values. |
| `json` | Structured JSON payloads. |

Current renderer kinds used by examples:

| Renderer | Meaning |
|----------|---------|
| `text` | Plain text. |
| `badge` | Status/tag-style display. |
| `datetime` | Locale-aware date-time display. |
| `number` | Number or duration-like display. |
| `external_link` | URL link display. |
| `json` | Preformatted structured JSON. |

Fields can declare read/write requirements. Field `unauthorized` currently
supports `hide` and `redact`.

```json
{
  "name": "payload",
  "value_type": "json",
  "renderer": "json",
  "required": false,
  "output_only": true,
  "auth": {
    "read": { "kind": "permission", "permission": "incidentEvents.payload.read" },
    "unauthorized": "redact"
  }
}
```

## Binding Format

Bindings describe where data comes from, but not how a specific client library
executes the transport. Current transports:

| Transport | Meaning |
|-----------|---------|
| `graphql` | Operation name or GraphQL operation identifier. |
| `rest` | REST operation/path identifier. |

Every binding has:

| Field | Purpose |
|-------|---------|
| `transport` | `graphql` or `rest`. |
| `operation` | Operation name/path understood by the runtime. |
| `result.path` | Dot-path to the useful result payload. |
| `variables` | Map of operation variables to typed binding values. |

Supported variable binding values:

| Binding Value | Example | Meaning |
|---------------|---------|---------|
| `literal` | `{ "kind": "literal", "value": 50 }` | Constant value. |
| `route` | `{ "kind": "route", "path": "name" }` | Value from route parameters. |
| `resource` | `{ "kind": "resource", "path": "name" }` | Value from the selected resource. |
| `form` | `{ "kind": "form" }` | Full form payload. |
| `form` path | `{ "kind": "form", "path": "update_mask" }` | Specific form-derived value. |
| `page` | `{ "kind": "page", "path": "page_size" }` | Pagination state. |
| `filters` | `{ "kind": "filters" }` | Current filter state. |

`data` references on route components, related resources, and timelines use a
smaller format:

| Field | Purpose |
|-------|---------|
| `binding` | Name of a route `data_bindings` entry. |
| `path` | Optional dot-path inside that binding result. |

Example:

```json
{ "data": { "binding": "incident", "path": "events" } }
```

## Auth Format

Auth requirements are recursive discriminated objects:

| Requirement | Format | Meaning |
|-------------|--------|---------|
| `public` | `{ "kind": "public" }` | No auth requirement. |
| `authenticated` | `{ "kind": "authenticated" }` | Requires a logged-in subject. |
| `permission` | `{ "kind": "permission", "permission": "orders.read" }` | Requires an exact permission string. |
| `role` | `{ "kind": "role", "role": "admin" }` | Requires an exact role string. |
| `all` | `{ "kind": "all", "requirements": [...] }` | Every child requirement must pass. |
| `any` | `{ "kind": "any", "requirements": [...] }` | At least one child requirement must pass. |

Supported auth placement:

| Surface | Field | Meaning | Unauthorized values |
|---------|-------|---------|---------------------|
| Route | `auth.requirement` | Page access and navigation visibility. | `hide`, `deny` |
| Route | `auth.fallback` | Optional safe route/path/http(s) URL shown or used by a host renderer after denial. | n/a |
| Route | `auth.denied_message` | Optional target-neutral denied copy. | n/a |
| Collection | `auth.read` | Default list/get read requirement. | n/a |
| Field | `auth.read` | Field visibility requirement. | `hide`, `redact` |
| Field | `auth.write` | Form/editability requirement. | `hide`, `redact` |
| Action | `auth.invoke` | Action invocation requirement. | `hide`, `disable` |

Example route auth:

```json
{
  "route": "/admin/products",
  "title": "Admin Products",
  "layout": "crud_list",
  "auth": {
    "requirement": { "kind": "permission", "permission": "products.admin" },
    "unauthorized": "deny",
    "fallback": "/products",
    "denied_message": "You do not have access to product administration."
  }
}
```

## Layout Formats

Current route layouts:

| Layout | Meaning |
|--------|---------|
| `crud_list` | Resource list page with filters, table, row/bulk actions. |
| `detail_page` | Single-resource page with header, sections, related data, timeline. |
| `dashboard` | Metrics and visualizations. |

## Component Formats

Components are discriminated by `kind`. Shared fields:

| Field | Purpose |
|-------|---------|
| `id` | Stable component id. |
| `kind` | Component kind. |
| `data` | Optional `{ "binding": "...", "path": "..." }` reference to route data. |

### `filter_bar`

```json
{ "id": "filters", "kind": "filter_bar", "collection": "incidentEvents" }
```

### `table`

```json
{
  "id": "table",
  "kind": "table",
  "data": { "binding": "incidents" },
  "table": {
    "collection": "incidentEvents",
    "columns": [
      { "id": "title", "field": "title", "label": "Title", "sortable": false, "visible": true }
    ],
    "selection": { "mode": "multiple", "required_for_bulk_actions": true },
    "row_navigation": "/incidents/{name}",
    "row_actions": ["open", "update", "delete"],
    "bulk_actions": ["delete"]
  }
}
```

Table format fields:

| Field | Purpose |
|-------|---------|
| `collection` | Collection that defines the row fields and actions. |
| `columns` | Visible and hidden table columns. |
| `selection` | Optional row-selection mode. |
| `row_navigation` | Optional route template opened from a row. |
| `row_actions` | Ordered action names available per selected row. |
| `bulk_actions` | Ordered action names available for selected rows. |
| `mobile` | Optional mobile presentation hints. |

Column format:

| Field | Purpose |
|-------|---------|
| `id` | Stable column id. |
| `field` | Collection field path to display. |
| `label` | Optional display label. |
| `sortable` | Whether the runtime may expose sorting. |
| `visible` | Set to `false` to keep the column in IR but hide it by default. |
| `width` | Optional renderer hint in pixels. |
| `align` | `start`, `center`, or `end`. |

Selection modes are `none`, `single`, and `multiple`.

Mobile table format:

```json
{
  "presentation": "cards",
  "primary_field": "title",
  "secondary_field": "service",
  "metadata_fields": ["severity", "created_at"],
  "action_display": "menu"
}
```

Mobile table fields:

| Field | Purpose |
|-------|---------|
| `presentation` | `table` keeps the table shape; `cards` asks renderers to switch to stacked row cards on narrow screens. |
| `primary_field` | Main card title field. |
| `secondary_field` | Optional subtitle/status field. |
| `metadata_fields` | Optional compact facts shown below the title. |
| `action_display` | `inline` or `menu` hint for row actions on small screens. |

### `detail_header`

```json
{
  "id": "header",
  "kind": "detail_header",
  "data": { "binding": "incident" },
  "detail": {
    "collection": "incidentEvents",
    "title_field": "title",
    "subtitle_field": "service",
    "status_field": "severity",
    "actions": ["update", "delete"],
    "sections": [
      { "id": "overview", "label": "Overview", "fields": ["title", "service", "severity"] }
    ]
  }
}
```

Detail format fields:

| Field | Purpose |
|-------|---------|
| `collection` | Collection that defines resource fields and actions. |
| `title_field` | Field used as the page title. |
| `subtitle_field` | Optional secondary field. |
| `status_field` | Optional badge/status field. |
| `actions` | Ordered action names for the resource. |
| `sections` | Field groups for the detail payload. |
| `tabs` | Optional grouping over sections and related resource ids. |
| `related` | Optional related-resource tables. |
| `timeline` | Optional event timeline. |
| `mobile` | Optional mobile detail presentation hints. |

Section format:

```json
{ "id": "overview", "label": "Overview", "fields": ["title", "service"] }
```

Tab format:

```json
{
  "id": "activity",
  "label": "Activity",
  "sections": ["overview"],
  "related": ["deployments"]
}
```

Related resource format:

```json
{
  "id": "deployments",
  "label": "Deployments",
  "collection": "deployments",
  "data": { "binding": "incidentDeployments" },
  "table": {
    "collection": "deployments",
    "columns": [{ "id": "name", "field": "name" }]
  }
}
```

Timeline format:

```json
{
  "data": { "binding": "incidentTimeline" },
  "title_field": "title",
  "time_field": "created_at",
  "description_field": "message"
}
```

Mobile detail format:

```json
{
  "sections_presentation": "stack",
  "related_presentation": "stack",
  "sticky_actions": true
}
```

Mobile detail fields:

| Field | Purpose |
|-------|---------|
| `sections_presentation` | `stack` or `tabs` hint for detail sections on narrow screens. |
| `related_presentation` | `stack` or `tabs` hint for related resources on narrow screens. |
| `sticky_actions` | Whether primary actions should stay reachable while scrolling. |

### `metric_row`

```json
{
  "id": "kpis",
  "kind": "metric_row",
  "data": { "binding": "stats" },
  "metrics": [
    { "id": "ack_rate", "label": "Ack Rate", "value_path": "ack_rate", "format": "percent" }
  ]
}
```

Metric formats:

| Format | Meaning |
|--------|---------|
| `number` | Plain numeric display. |
| `percent` | Ratio rendered as percent. |
| `currency` | Currency-like numeric display. |
| `duration` | Duration-like numeric display. |
| `datetime` | Date-time display. |

### `chart`

```json
{
  "id": "incidents-by-day",
  "kind": "chart",
  "data": { "binding": "series" },
  "chart": {
    "kind": "line",
    "title": "Incidents by Day",
    "encoding": { "x": "day", "y": "count", "color": "severity" },
    "height": 320,
    "smooth": true
  }
}
```

Supported chart kinds:

| Chart Kind | Typical Encoding |
|------------|------------------|
| `line` | `x`, `y`, optional `color` |
| `bar` | `x`, `y`, optional `color`, optional `stack` |
| `area` | `x`, `y`, optional `color`, optional `smooth` |
| `pie` | `category`, `value` |
| `heatmap` | `x`, `y`, `color` |
| `scatter` | `x`, `y`, optional `size`, optional `color` |
| `radar` | `x`, `y`, optional `color` |
| `rose` | `category`, `value` |
| `radial_bar` | `x`, `y` |
| `funnel` | `category`, `value` |
| `treemap` | `category`, `value` |
| `word_cloud` | `category`, `value` |
| `gauge` | `value` |
| `liquid` | `value` |

### `chart_grid`

`chart_grid` lays out charts by referencing chart component ids.

```json
{
  "id": "visualization-grid",
  "kind": "chart_grid",
  "data": { "binding": "series" },
  "columns": 2,
  "chart_refs": ["incidents-by-day", "severity-share"]
}
```

### `video`

`video` describes target-neutral playback intent. React targets lower it to a
playable HTML `<video>` element.

```json
{
  "id": "demo-video",
  "kind": "video",
  "video": {
    "title": "Demo video",
    "sources": [
      { "src": "/media/open-ui-ir-demo.mp4", "type": "video/mp4" },
      { "src": "/media/open-ui-ir-demo.webm", "type": "video/webm" }
    ],
    "poster": "/media/open-ui-ir-demo.jpg",
    "caption": "Playable product walkthrough rendered from Open UI IR.",
    "controls": true,
    "plays_inline": true,
    "fit": "contain",
    "aspect_ratio": "16/9"
  }
}
```

Video format fields:

| Field | Purpose |
|-------|---------|
| `src` | Optional single media URL. |
| `sources` | Optional ordered source list with `src` and media `type`; either `src` or `sources` is required. |
| `title` | Optional heading/title around the player. |
| `caption` | Optional supporting text below the player. |
| `poster` | Optional poster image URL. |
| `controls` | Whether browser playback controls are shown; defaults to true in React targets. |
| `autoplay` | Whether playback should start automatically. |
| `muted` | Whether playback starts muted. |
| `loop` | Whether playback loops. |
| `plays_inline` | Hint for inline mobile playback; defaults to true in React targets. |
| `fit` | `contain` or `cover` object-fit hint. |
| `aspect_ratio` | Stable player ratio such as `16/9` or `4/3`. |

## Filter Formats

| Filter Kind | Meaning |
|-------------|---------|
| `text` | Free text input. |
| `select` | Single option. |
| `multi_select` | Multiple options. |
| `date_range` | Start/end dates. |
| `boolean` | Toggle/checkbox. |

Each filter references a collection field through `cel_field`.
`select` and `multi_select` filters can provide `options`, where each option is
`{ "label": "...", "value": "..." }`.

## Action Formats

Current action methods:

| Method | Meaning |
|--------|---------|
| `get` | Read/open a resource. |
| `create` | Create a resource; requires `form`. |
| `update` | Update a resource; requires `form.update_mask`. |
| `delete` | Delete a resource; requires destructive confirmation. |
| `custom` | Domain-specific mutation/action. |

Create and update forms support these controls:

| Control | Meaning |
|---------|---------|
| `text` | Single-line text. |
| `textarea` | Multi-line text. |
| `number` | Numeric input. |
| `checkbox` | Boolean input. |
| `select` | Single option. |
| `multi_select` | Multiple options. |
| `date_time` | Date-time input. |
| `json` | Structured JSON input. |

Interaction metadata can describe confirmation, submit presentation, outcome
copy, and optimistic update intent. Supported optimistic update modes:

Confirmation format:

```json
{
  "title": "Delete incident",
  "message": "Delete selected incident?",
  "confirm_label": "Delete",
  "cancel_label": "Cancel",
  "destructive": true
}
```

Submit presentation values:

| Presentation | Meaning |
|--------------|---------|
| `inline` | Trigger directly from the current surface. |
| `modal` | Open a modal form before submit. |
| `confirm` | Ask for confirmation before submit. |

Outcome format can include `success_message`, `failure_message`, and
`refresh_bindings`.

| Mode | Meaning |
|------|---------|
| `none` | No optimistic resource change. |
| `prepend_resource` | Add created resource to the front of a list. |
| `replace_resource` | Replace the current resource. |
| `patch_resource` | Patch fields on the current resource. |
| `remove_resource` | Remove the resource from current lists. |
