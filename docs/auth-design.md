# Auth Design

## Goal

Open UI IR should describe authorization requirements for UI intent without
becoming the authorization engine. The frontend renderer can use auth metadata
to hide, disable, redirect, or explain UI affordances, but the backend remains
the security boundary for every data operation.

## Alpha Implementation Status

Implemented in the current alpha:

- protocol types for `AuthRequirement`, auth policies, and unauthorized
  presentation values
- JSON Schema support for route, collection, field, and action auth metadata
- compiler validation for structural auth correctness
- compiler-core `can(requirement, context)` helper
- example documents with route, collection, field, and action auth metadata
- React AntD and React Mantine generated pages that accept an `authContext` prop
  and:
  - render a denied state for direct route access when route auth fails
  - filter table columns/mobile card fields by field read requirements
  - hide or disable generated action buttons by action invoke requirements

Not implemented yet:

- generated navigation menu filtering across route files
- demo runtime auth switching
- backend policy generation or provider-specific auth SDK integration

## Non-Goals

- Do not put access tokens, refresh tokens, sessions, cookies, or secret claims
  in an IR document.
- Do not make frontend visibility rules the source of truth for security.
- Do not embed a full policy language in the first version.
- Do not require every target to use the same identity provider or auth SDK.

## Security Boundary

Authorization has two enforcement points:

1. Backend enforcement, required
   - GraphQL, REST, or RPC handlers enforce every read and mutation.
   - The backend decides whether the subject can perform the operation.
   - Denied backend responses must be handled even if the frontend already hid
     the UI affordance.
2. Renderer affordance, optional
   - The renderer can hide or disable routes, fields, filters, actions, and
     navigation entries based on auth metadata and a runtime auth context.
   - This improves UX and reduces confusing unavailable actions.
   - It is not a substitute for backend enforcement.

## Auth Context

The renderer receives the current subject's auth context from the host
application or runtime shell. The IR references required capabilities; it does
not define the current user's capabilities.

```ts
interface AuthContext {
  subject: string;
  authenticated: boolean;
  permissions: string[];
  roles?: string[];
  claims?: Record<string, unknown>;
}
```

The host application owns how this context is populated. For example, a React
AntD shell might derive it from an OIDC session, while a terminal renderer might
derive it from an API token profile.

## Requirement Model

First version requirement shape:

```ts
type AuthRequirement =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; permission: string }
  | { kind: "role"; role: string }
  | { kind: "all"; requirements: AuthRequirement[] }
  | { kind: "any"; requirements: AuthRequirement[] };
```

Semantics:

| Kind | Meaning |
|------|---------|
| `public` | No auth requirement. |
| `authenticated` | Requires a logged-in subject. |
| `permission` | Requires an exact permission string. |
| `role` | Requires an exact role string. |
| `all` | Every child requirement must pass. |
| `any` | At least one child requirement must pass. |

This is intentionally simple. It can represent most route/action/field
capability checks without introducing policy expressions in alpha.

## Placement

Auth requirements should attach to the semantic thing being protected, not to a
specific widget.

### Route Auth

Routes can declare auth requirements for page access and navigation visibility.

```json
{
  "route": "/admin/incidents",
  "title": "Admin Incidents",
  "layout": "crud_list",
  "auth": {
    "requirement": { "kind": "permission", "permission": "incidents.admin" },
    "fallback": "/incidents",
    "denied_message": "You do not have access to incident administration."
  }
}
```

Renderer behavior:

- hide navigation entries when the requirement fails
- redirect to `fallback` when present
- otherwise render a denied state

Backend behavior:

- still enforce all underlying data operations

### Collection Auth

Collections can declare a default read requirement.

```json
{
  "name": "incidentEvents",
  "auth": {
    "read": { "kind": "permission", "permission": "incidents.read" }
  }
}
```

Renderer behavior:

- hide collection-backed routes or render denied states
- avoid making list/get requests when the requirement fails

Backend behavior:

- enforce list/get permissions

### Field Auth

Fields can declare visibility and editability requirements.

```json
{
  "name": "payload",
  "value_type": "json",
  "renderer": "json",
  "required": false,
  "output_only": true,
  "auth": {
    "read": { "kind": "permission", "permission": "incidents.payload.read" }
  }
}
```

Renderer behavior:

- omit unauthorized table columns, detail fields, mobile metadata fields, and
  form controls
- optionally show a redacted placeholder when the product wants visible denial

Backend behavior:

- avoid returning sensitive fields unless authorized
- reject unauthorized updates

### Action Auth

Actions can declare invoke requirements.

```json
{
  "name": "delete",
  "label": "Delete",
  "method": "delete",
  "auth": {
    "invoke": { "kind": "permission", "permission": "incidents.delete" },
    "unauthorized": "hide"
  }
}
```

Renderer behavior:

- hide or disable unauthorized actions
- preserve destructive confirmations for authorized users
- handle backend denial responses

Backend behavior:

- enforce the mutation permission

## Unauthorized Presentation

Different products need different unauthorized UX. Keep it declarative and
target-neutral:

```ts
type UnauthorizedPresentation = "hide" | "disable" | "redact" | "deny";
```

Suggested defaults:

| Surface | Default |
|---------|---------|
| Route navigation item | `hide` |
| Route direct access | `deny` |
| Table/detail field | `hide` |
| Sensitive field value | `redact` when product asks for visible denial |
| Action | `hide` |
| Required workflow action | `disable` with reason |

## Runtime Evaluation

Renderer shells should evaluate requirements with a small target-neutral helper:

```ts
function can(requirement: AuthRequirement | undefined, context: AuthContext): boolean {
  if (requirement === undefined) return true;
  switch (requirement.kind) {
    case "public":
      return true;
    case "authenticated":
      return context.authenticated;
    case "permission":
      return context.permissions.includes(requirement.permission);
    case "role":
      return context.roles?.includes(requirement.role) ?? false;
    case "all":
      return requirement.requirements.every((child) => can(child, context));
    case "any":
      return requirement.requirements.some((child) => can(child, context));
  }
}
```

Targets can use this helper to filter routes, columns, fields, mobile card
metadata, and action lists before rendering.

## Validator Rules

Compiler validation should check structural integrity:

- auth requirement objects use known `kind` values
- `all` and `any` have at least one child requirement
- `permission` has a non-empty permission string
- `role` has a non-empty role string
- unauthorized presentation values are known
- auth metadata does not appear in binding variables or data payloads

Validation should not check whether a permission exists in an identity provider.
That belongs to integration tests or a future policy registry.

## Target Lowering

React targets:

- filter routes before creating navigation
- filter table columns and mobile metadata fields
- filter detail sections and form fields
- hide or disable actions based on `unauthorized`
- render a denied state for direct route access

TUI targets:

- omit unauthorized screens and commands
- show denied screens for direct command navigation
- disable key bindings when required actions are unauthorized

Generated-code targets:

- emit hooks or helper boundaries where the host app passes `AuthContext`
- avoid importing provider-specific SDKs

## Open Questions

- Should permissions be declared in a top-level registry for documentation and
  drift detection?
- Should field redaction be represented as a renderer hint or a backend result
  state?
- Should route fallback support multiple cases, such as login vs denied?
- When should we introduce CEL/Rego/Oso-style ABAC expressions?
- How should auth requirements compose with tenant/project scoping?

## Implemented Alpha Scope

1. Add protocol types for `AuthRequirement`, `AuthPolicy`, and unauthorized
   presentation.
2. Allow auth metadata on routes, collections, fields, and actions.
3. Add validator checks for structural auth correctness.
4. Add target-neutral `can()` helper in compiler/runtime support code.
5. Update React AntD and React Mantine generated output to accept an
   `authContext` prop, render route denied states, filter field-backed
   table/mobile affordances, and hide/disable action buttons.
6. Keep all backend operation enforcement outside IR and explicitly document
   that frontend auth is UX only.
