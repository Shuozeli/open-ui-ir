# AIP BaaS Design

## Goal

Build a lightweight Firebase/Supabase-style backend platform whose public API is
strictly AIP resource-oriented and whose runtime supports PostgreSQL and SQLite.
PostgreSQL is the production backend; SQLite is an optional embedded backend for
local development, tests, offline tools, and small single-node deployments.

The product is not a generic REST wrapper over SQL tables. Users write a
high-level DSL that describes resources, fields, relationships, indexes, auth,
policies, realtime behavior, and storage. The compiler generates AIP-compliant
RPC services, HTTP transcoding, backend-specific migrations, server handlers,
SDK types, and admin metadata.

Working name in this document: `Litebase`.

## Non-Goals

- Do not expose arbitrary `/api/{table}` CRUD as the product API.
- Do not make PostgreSQL or SQLite table names the public resource model.
- Do not promise distributed writes, multi-primary replication, or cloud-scale
  semantics in the first version.
- Do not implement a full Firebase/Supabase feature clone in MVP.
- Do not add arbitrary SQL execution to client SDKs.
- Do not treat frontend authorization checks as a security boundary.

## AIP Requirements

The generated API contract must follow these AIP rules:

| Area | Requirement |
|------|-------------|
| Resource-oriented design | Public API surfaces named resources and standard methods, not database tables. See AIP-121. |
| Resource names | Every resource has a canonical `name` field and a declared resource pattern. See AIP-122/AIP-123. |
| Methods | Use `Get`, `List`, `Create`, `Update`, and `Delete` before custom methods. See AIP-130 to AIP-136. |
| HTTP mapping | HTTP routes are generated from RPCs using `google.api.http` transcoding. See AIP-127. |
| Standard fields | Generated resources include standard fields where applicable: `name`, `create_time`, `update_time`, `delete_time`, `etag`. See AIP-148/AIP-154. |
| Pagination | List methods use `page_size`, `page_token`, and `next_page_token`. See AIP-158. |
| Filtering | List filters use the AIP filtering shape, compiled to safe parameterized SQL for the selected backend. See AIP-160. |
| Field masks | Update methods use `google.protobuf.FieldMask update_mask`. See AIP-161. |
| Errors | Runtime errors map to canonical error codes and structured error details. See AIP-193. |
| Field behavior | Generated proto fields include required/output-only/immutable/input-only annotations. See AIP-203. |
| Authorization | Authorization checks are explicit per method/resource. See AIP-211. |

Generated protos must pass API Linter before an artifact is publishable. The DSL
compiler also performs earlier, source-oriented checks so users receive errors
against YAML locations rather than generated proto lines.

## Product Shape

```text
litebase.yaml
      |
      v
DSL parser
      |
      v
Semantic IR
      |
      +--> AIP conformance validator
      +--> proto service/message generator
      +--> HTTP transcoding generator
      +--> persistence planner
      |      +--> PostgreSQL migration generator
      |      +--> SQLite migration generator
      +--> server handler generator
      +--> TypeScript SDK generator
      +--> admin console metadata generator
      +--> conformance fixture generator
```

PostgreSQL and SQLite are persistence targets behind one repository contract.
The public API is generated from the DSL resource model and never reflected
from a live database. Backend selection cannot alter resource names, RPC
messages, HTTP routes, auth policy meaning, or SDK method shapes.

## V1 Design Decisions

The alpha release uses the following decisions as constraints, not open-ended
implementation choices:

| Decision | V1 rule |
|----------|---------|
| Canonical model | A versioned semantic IR is canonical. YAML and JSON are authoring formats; proto, OpenAPI, SQL, SDKs, and server code are derived artifacts. |
| API transports | Generate one proto contract and serve both gRPC and HTTP/JSON transcoding from the same handlers. |
| Production backend | PostgreSQL is the default and required target for hosted or multi-instance deployments. |
| Embedded backend | SQLite is supported for local, test, and explicitly single-node deployments; it is never assumed to provide distributed coordination. |
| Database isolation | PostgreSQL maps a logical `Database` to a private schema by default; SQLite maps it to one file. Dedicated PostgreSQL databases are an optional deployment profile. |
| Resource IDs | Server-generated lowercase IDs are the default. A resource may require a user-specified ID explicitly. |
| Updates | `update_mask` is required in V1. Full replacement and inferred masks are not supported. |
| Concurrency | Mutable resources carry an unannotated `etag`. Update and delete enforce it when the DSL marks freshness validation as required. |
| Transactions | Every unary mutation runs in one backend transaction, including resource writes, event outbox writes, and storage metadata changes. |
| Compatibility | DSL changes are classified before migration generation. Destructive or ambiguous changes require an explicit migration block. |

The PostgreSQL implementation defines production semantics. SQLite must pass
the same repository conformance suite or explicitly report an unsupported
capability during generation; it cannot silently weaken API behavior.

## Authoring DSL and Semantic IR

`litebase.yaml` is optimized for people. The compiler parses it into a closed,
versioned IR before validation or generation:

```ts
interface ApiIrV1 {
  irVersion: "litebase.ir/v1alpha1";
  api: ApiIdentity;
  resources: ResourceIr[];
  auth?: AuthIr;
  storage?: StorageIr;
}

interface ResourceIr {
  type: string;
  resourceType: string;
  singular: string;
  plural: string;
  pattern: ResourcePatternIr;
  fields: FieldIr[];
  indexes: IndexIr[];
  methods: StandardMethodsIr;
  policies: MethodPoliciesIr;
  persistence: PersistenceIr;
  realtime?: RealtimeIr;
}
```

The IR contains no YAML shorthand. It has explicit defaults, allocated proto
field numbers, normalized resource references, resolved parent types, logical
storage types, indexes, and compiled policy expressions. Physical SQL types are
selected by a backend planner after semantic validation. Generators only
consume valid IR; they never read YAML directly.

Compilation is deterministic. Given the same DSL, compiler version, and field
number registry, every generated artifact must be byte-for-byte stable.

### DSL Defaults

- `singular` defaults to lower camel case of `type`.
- `plural` must be supplied when normal pluralization is ambiguous.
- `pattern` must end in `/{singular}` and its collection segment must match
  `plural`.
- `table` defaults to a stable snake_case form of the resource type and is
  private to persistence.
- `get` and `list` are generated unless the resource is declared `singleton`.
- Create, update, and delete are opt-in because they change the security and
  lifecycle surface.
- `create.id_policy` is `server`, `optional`, or `required`. `server` omits the
  ID from the ergonomic method signature, `optional` accepts a client ID or
  generates one, and `required` requires `{singular}_id`.
- `list.default_page_size` defaults to 50 and `max_page_size` defaults to 1000.
- Every request field receives an explicit AIP-203 field behavior annotation,
  except resource `etag`, which follows AIP-154.

Unknown DSL keys are errors. Alpha versions may make breaking schema changes,
but a document must always declare its DSL version so diagnostics can identify
the expected contract.

### Field Type System

The DSL type system is intentionally smaller than proto or SQL. This avoids
transport-specific declarations leaking into the resource model.

| DSL type | Proto | PostgreSQL | SQLite | Filter support |
|----------|-------|------------|--------|----------------|
| `string` | `string` | `TEXT` | `TEXT` | equality, ordering; contains only with declared search index |
| `bool` | `bool` | `BOOLEAN` | constrained `INTEGER` | equality |
| `int32`, `int64` | same scalar | `INTEGER`, `BIGINT` | `INTEGER` | equality and ordering |
| `float`, `double` | same scalar | `REAL`, `DOUBLE PRECISION` | `REAL` | equality and ordering with documented precision behavior |
| `bytes` | `bytes` | `BYTEA` | `BLOB` | none |
| `timestamp` | `Timestamp` | `TIMESTAMPTZ` | RFC 3339 `TEXT` | equality and ordering |
| `duration` | `Duration` | `BIGINT` microseconds | `INTEGER` microseconds | equality and ordering |
| `enum` | generated enum | constrained `TEXT` | constrained `TEXT` | equality and ordering |
| `resource_name` | annotated `string` | canonical name `TEXT` | canonical name `TEXT` | equality |
| `message` | generated message | `JSONB` | canonical JSON `TEXT` | none in V1 |

Fields may be `repeated` except for `bytes`. Repeated and message fields cannot
be indexed or ordered in V1. Map syntax is limited to `map<string, scalar>` and
is stored as `JSONB` or canonical JSON. Decimal money values use a dedicated
message type, not floating point.

Presence is explicit in the semantic IR. `required` means callers must provide
a meaningful value on create; it does not rely on proto scalar default
detection. Optional scalars that need presence generate proto `optional`
fields. Server defaults are applied before persistence and the fully populated
resource is returned.

## DSL Example

```yaml
dsl_version: litebase.dsl/v1alpha1

api:
  service: example.litebase.dev
  proto_package: litebase.example.v1
  title: Example API
  version: v1

persistence:
  targets: [postgresql, sqlite]
  production: postgresql

projects:
  resource: Project
  pattern: projects/{project}

databases:
  resource: Database
  pattern: projects/{project}/databases/{database}

resources:
  - type: Post
    plural: posts
    resource_type: example.litebase.dev/Post
    pattern: projects/{project}/databases/{database}/posts/{post}
    table: posts

    standard_fields:
      create_time: true
      update_time: true
      etag: true

    fields:
      - name: title
        type: string
        required: true
      - name: body
        type: string
      - name: author
        type: string
        resource_reference: example.litebase.dev/User
        required: true
      - name: published
        type: bool
        default: false
    indexes:
      - fields:
          - { name: author, order: asc }
          - { name: create_time, order: desc }
      - fields:
          - { name: published, order: asc }
          - { name: update_time, order: desc }

    methods:
      get: {}
      list:
        filter: true
        order_by: true
      create:
        id_policy: optional
      update:
        etag: required
      delete:
        etag: required

    auth:
      get:
        allow: authenticated
      list:
        allow: authenticated
      create:
        allow: authenticated
        set:
          author: auth.user_name
      update:
        allow:
          owner:
            field: author
      delete:
        allow:
          owner:
            field: author

    realtime:
      enabled: true
      events: [created, updated, deleted]

storage:
  buckets:
    - name: media
      objects:
        pattern: projects/{project}/storage/buckets/{bucket}/objects/{object}
      auth:
        read: public
        write: authenticated
```

## Generated Resource

```proto
syntax = "proto3";

package litebase.example.v1;

import "google/api/field_behavior.proto";
import "google/api/resource.proto";
import "google/protobuf/timestamp.proto";

message Post {
  option (google.api.resource) = {
    type: "example.litebase.dev/Post"
    pattern: "projects/{project}/databases/{database}/posts/{post}"
    singular: "post"
    plural: "posts"
  };

  string name = 1 [(google.api.field_behavior) = IDENTIFIER];
  string title = 2 [(google.api.field_behavior) = REQUIRED];
  string body = 3;
  string author = 4 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = {
      type: "example.litebase.dev/User"
    }
  ];
  bool published = 5;
  google.protobuf.Timestamp create_time = 6 [(google.api.field_behavior) = OUTPUT_ONLY];
  google.protobuf.Timestamp update_time = 7 [(google.api.field_behavior) = OUTPUT_ONLY];
  string etag = 8;
}
```

`name` is always field 1 and uses `IDENTIFIER`. `etag` intentionally has no
field behavior annotation, following AIP-154's exception to the general
AIP-203 rule.

## Generated Service

```proto
service PostService {
  rpc GetPost(GetPostRequest) returns (Post) {
    option (google.api.http) = {
      get: "/v1/{name=projects/*/databases/*/posts/*}"
    };
    option (google.api.method_signature) = "name";
  }

  rpc ListPosts(ListPostsRequest) returns (ListPostsResponse) {
    option (google.api.http) = {
      get: "/v1/{parent=projects/*/databases/*}/posts"
    };
    option (google.api.method_signature) = "parent";
  }

  rpc CreatePost(CreatePostRequest) returns (Post) {
    option (google.api.http) = {
      post: "/v1/{parent=projects/*/databases/*}/posts"
      body: "post"
    };
    option (google.api.method_signature) = "parent,post,post_id";
  }

  rpc UpdatePost(UpdatePostRequest) returns (Post) {
    option (google.api.http) = {
      patch: "/v1/{post.name=projects/*/databases/*/posts/*}"
      body: "post"
    };
    option (google.api.method_signature) = "post,update_mask";
  }

  rpc DeletePost(DeletePostRequest) returns (google.protobuf.Empty) {
    option (google.api.http) = {
      delete: "/v1/{name=projects/*/databases/*/posts/*}"
    };
    option (google.api.method_signature) = "name,etag";
  }
}
```

## Generated Requests

```proto
message GetPostRequest {
  string name = 1 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = { type: "example.litebase.dev/Post" }
  ];
}

message ListPostsRequest {
  string parent = 1 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = { child_type: "example.litebase.dev/Post" }
  ];
  int32 page_size = 2 [(google.api.field_behavior) = OPTIONAL];
  string page_token = 3 [(google.api.field_behavior) = OPTIONAL];
  string filter = 4 [(google.api.field_behavior) = OPTIONAL];
  string order_by = 5 [(google.api.field_behavior) = OPTIONAL];
}

message ListPostsResponse {
  repeated Post posts = 1;
  string next_page_token = 2;
}

message CreatePostRequest {
  string parent = 1 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = { child_type: "example.litebase.dev/Post" }
  ];
  Post post = 2 [(google.api.field_behavior) = REQUIRED];
  string post_id = 3 [(google.api.field_behavior) = OPTIONAL];
}

message UpdatePostRequest {
  Post post = 1 [(google.api.field_behavior) = REQUIRED];
  google.protobuf.FieldMask update_mask = 2 [(google.api.field_behavior) = REQUIRED];
}

message DeletePostRequest {
  string name = 1 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = { type: "example.litebase.dev/Post" }
  ];
  string etag = 2 [(google.api.field_behavior) = REQUIRED];
}
```

Generated protos also include comments, resource references, field behavior,
and method signatures. These are part of the contract and are covered by golden
tests; they are not documentation-only decoration.

## Persistence Architecture

The runtime depends on a backend-neutral repository contract. PostgreSQL and
SQLite planners lower the same resource IR into different physical schemas and
queries. Generated handlers never contain backend conditionals.

```rust
#[async_trait]
trait ResourceRepository {
    async fn get(&self, request: GetPlan) -> Result<ResourceRow, StoreError>;
    async fn list(&self, request: ListPlan) -> Result<Page<ResourceRow>, StoreError>;
    async fn create(&self, request: CreatePlan) -> Result<ResourceRow, StoreError>;
    async fn update(&self, request: UpdatePlan) -> Result<ResourceRow, StoreError>;
    async fn delete(&self, request: DeletePlan) -> Result<(), StoreError>;
}
```

`GetPlan` and the other plans are typed logical operations containing validated
field IDs, predicates, order terms, values, and policy constraints. They do not
contain raw SQL. A backend SQL compiler emits parameterized statements using
its own placeholder, quoting, type, and pagination rules.

### PostgreSQL Backend

PostgreSQL is required when any of these are true:

- more than one runtime instance serves the same logical database
- high write concurrency or durable connection coordination is required
- managed backup, point-in-time recovery, read replicas, or operational SQL
  tooling is required
- production availability depends on a database process separate from the API
  process

By default, one physical PostgreSQL database contains a control schema and one
private schema per logical `Database` resource:

```text
PostgreSQL database
  _litebase                  control plane tables
  db_01j...k7                generated app tables + event outbox
  db_01j...p2                generated app tables + event outbox
```

Schema names come from internal UIDs and are never accepted from request data.
Every generated SQL identifier is statically quoted and schema-qualified; the
runtime does not rely on caller-controlled `search_path`. Deployments needing
stronger isolation may map each logical database to a dedicated PostgreSQL
database through runtime configuration without changing the public API.

Representative generated PostgreSQL schema:

```sql
create table "db_01j_k7"."posts" (
  "name" text primary key,
  "parent" text not null,
  "title" text not null,
  "body" text,
  "author" text not null,
  "published" boolean not null default false,
  "create_time" timestamptz not null,
  "update_time" timestamptz not null,
  "etag" text not null
);

create index "posts_by_author_create_time"
  on "db_01j_k7"."posts" ("author" asc, "create_time" desc, "name" asc);
```

PostgreSQL runtime invariants:

- connection pools are bounded per physical database, not per request
- transactions use `READ COMMITTED` by default; etag predicates prevent lost
  updates
- update and delete use conditional DML (`where name = ... and etag = ...`) or
  lock the existing row before evaluating row-dependent policy; a read followed
  by an unconditional write is forbidden
- retryable serialization, deadlock, and connection failures map through the
  canonical error layer
- UTC `TIMESTAMPTZ` values are converted to protobuf timestamps at the boundary
- the durable event table is the source of truth; `LISTEN/NOTIFY` is only a
  low-latency wake-up signal and may be lost safely
- migrations use PostgreSQL advisory locks so only one runtime migrates a
  logical database at a time

### SQLite Backend

SQLite remains a supported compatibility backend, not the production
foundation. Each logical `Database` maps to one file; control-plane metadata
uses a separate file. The runtime opens files by internal UID, never by a
client-supplied path.

```text
data/
  control.sqlite
  databases/
    01J...K7.sqlite
    01J...P2.sqlite
```

Representative generated SQLite schema:

```sql
create table posts (
  name text primary key,
  parent text not null,
  title text not null,
  body text,
  author text not null,
  published integer not null default 0,
  create_time text not null,
  update_time text not null,
  etag text not null
);

create index posts_by_author_create_time
  on posts (author asc, create_time desc, name asc);

create index posts_by_published_update_time
  on posts (published asc, update_time desc, name asc);
```

SQLite runtime invariants:

- only one runtime process may own a database file in the supported profile
- foreign keys are enabled for every connection
- journal mode is WAL and `busy_timeout` is configured by the runtime
- timestamps are UTC RFC 3339 text with microsecond precision
- booleans are constrained integers; enums are constrained strings
- a request cannot atomically mutate two database files
- startup takes an exclusive migration lease before applying migrations

### Shared System Model

Logical system tables exist in both backends:

```text
_litebase_projects
_litebase_databases
_litebase_migrations
_litebase_users
_litebase_sessions
_litebase_api_keys
_litebase_policy_rules
_litebase_events
_litebase_event_consumers
_litebase_storage_buckets
_litebase_storage_objects
```

The control store owns projects, database registrations, users, sessions, API
keys, backend mappings, and schema metadata. Each logical database owns its
application tables, event outbox, and storage metadata. Resource references
store canonical resource names rather than backend row IDs, and generated
indexes include `name asc` where required for stable keyset pagination.

All writes go through generated handlers. Direct SQL is an escape hatch and
does not guarantee policy enforcement, event emission, etag updates, or
realtime delivery.

### Backend Capability Contract

Generation validates the requested deployment profile before emitting SQL:

| Capability | PostgreSQL | SQLite |
|------------|------------|--------|
| Standard CRUD and field masks | yes | yes |
| Atomic etag mutations | yes | yes |
| Keyset pagination | yes | yes |
| Transactional event outbox | yes | yes |
| Multiple runtime instances | yes | no |
| Concurrent writers | yes | serialized |
| Logical database isolation | schema or database | file |
| Realtime wake-up | `LISTEN/NOTIFY` plus outbox | polling/in-process plus outbox |
| Managed PITR/read replicas | deployment-dependent | no |

The portable profile is the common semantic subset. A DSL requiring a
PostgreSQL-only capability must declare `persistence.required: [postgresql]`;
generation for SQLite then fails with a source diagnostic. The runtime never
silently falls back to weaker behavior.

## Schema Evolution and Migrations

The compiler compares the previous semantic IR snapshot with the new one. It
does not infer migrations by introspecting a live database. The logical change
plan is backend-neutral; each selected backend lowers it to its own SQL
migration and records its own digest.

Changes are classified as:

| Class | Examples | Behavior |
|-------|----------|----------|
| Compatible | add optional field, add index, add method, relax policy | migration generated automatically |
| Conditional | add required field with default, rename field with stable proto number, change index | requires an explicit migration declaration |
| Breaking | remove field, reuse proto number, change field type, alter resource pattern, narrow ID format | rejected unless the API version changes and a data migration is supplied |

Every successful generation writes a lock file containing resource types,
resource patterns, proto field numbers, enum numbers, SQL names, and compiler
version. Deleted proto field numbers and names are reserved permanently.

```yaml
migrations:
  - id: 2026-07-add-post-summary
    resource: Post
    backfill:
      field: summary
      expression: truncate(body, 160)
```

Migration expressions use a small compiler-owned function set. Arbitrary SQL
inside the DSL is not allowed. Advanced users may provide a separately reviewed
SQL migration file, but doing so marks the migration as runtime-specific and
outside portable DSL guarantees.

Migration application is transactional where the selected backend permits it.
PostgreSQL and SQLite migration artifacts have separate digests. The runtime
records the DSL digest, logical plan digest, backend kind, and SQL digest in
`_litebase_migrations`, and refuses to start when an applied migration ID has
different content or belongs to another backend.

## Resource Name Mapping

The compiler generates parsers for every resource pattern:

```text
projects/{project}/databases/{database}/posts/{post}
```

Handler responsibilities:

- validate `parent` and `name` match the resource pattern
- derive `parent` from `name` for storage
- reject cross-parent create/update attempts
- generate resource ids when `post_id` is absent and the resource allows
  server-generated ids
- preserve `name` stability across updates

Both backends store canonical `name` as the primary key and a `parent` column
for list queries. Internal schema, database, and file identifiers never appear
in resource names.

## Pagination

List uses AIP pagination fields:

```text
page_size
page_token
next_page_token
```

Runtime implementation uses keyset pagination, not offsets. Page tokens are
opaque signed payloads containing:

```json
{
  "version": 1,
  "resource": "example.litebase.dev/Post",
  "parent": "projects/acme/databases/main",
  "order_by": [
    { "field": "update_time", "direction": "desc" },
    { "field": "name", "direction": "asc" }
  ],
  "filter_fingerprint": "sha256:...",
  "last_values": ["2026-07-16T00:00:00Z", "projects/acme/databases/main/posts/post-1"]
}
```

The compiler appends `name asc` as a stable tie-breaker when the configured
ordering is not unique.

## Filtering and Ordering

The DSL may enable AIP-style `filter` and `order_by` on list methods. MVP
supports a safe subset:

- equality: `field = "value"`
- inequality on scalar fields: `<`, `<=`, `>`, `>=`
- boolean conjunction: `AND`
- order by indexed fields plus implicit `name`

Portable V1 does not define full-text or substring matching because PostgreSQL
and SQLite indexing/tokenization semantics differ. Search is a future explicit
capability, not an accidental interpretation of AIP filter syntax.

Unsupported filters return `INVALID_ARGUMENT`, not raw SQL errors.

Filter compilation flow:

```text
filter string
  -> parser
  -> typed AST
  -> resource field validation
  -> policy-aware predicate merge
  -> backend SQL compiler
  -> parameterized PostgreSQL or SQLite SQL
```

No user-provided filter string is ever concatenated into SQL.

## Update Semantics

Updates use field masks. The runtime:

- requires `post.name`
- validates every mask path is mutable
- rejects output-only fields in the mask
- applies only masked fields
- updates `update_time`
- rotates `etag`
- checks `etag` when provided
- emits an update event

If `update_mask` is omitted, the runtime returns `INVALID_ARGUMENT`. A wildcard
mask is not accepted in V1. When freshness validation is required, a missing
etag is `INVALID_ARGUMENT` and a stale etag is `ABORTED`.

## Transaction and Consistency Model

Create, update, and delete use one backend transaction. PostgreSQL begins a
normal read-write transaction; SQLite uses `BEGIN IMMEDIATE` to acquire its
write reservation before policy-dependent reads:

1. Resolve auth context and validate request syntax before opening a write
   transaction.
2. Read any row needed for ownership, existence, or etag checks.
3. Apply the mutation and relational constraints.
4. Insert the realtime outbox event in `_litebase_events`.
5. Commit before returning the fully populated resource.

After a successful mutation returns, a subsequent get on the same database sees
the committed state. Delete returns only after get would return `NOT_FOUND`.
Realtime delivery occurs after commit and is not part of request completion.

Read methods use the backend's statement snapshot semantics. List page tokens
preserve query shape, not a historical database snapshot, so concurrent inserts
or updates may change later pages. Keyset pagination prevents offset drift but
does not promise a repeatable multi-page snapshot on either backend.

## Auth Model

MVP auth:

- email/password signup and login
- signed JWT access tokens
- refresh/session records in the configured control store
- API keys for server-to-server calls
- generated handlers receive an `AuthContext`

```ts
interface AuthContext {
  principal: string;
  user_name?: string;
  project_name?: string;
  authenticated: boolean;
  roles: string[];
  claims: Record<string, unknown>;
}
```

Generated user resource:

```text
projects/{project}/auth/users/{user}
```

Auth service methods should still use AIP where reasonable, but login/logout are
custom methods because they are actions, not CRUD over a durable resource:

```proto
rpc SignUp(SignUpRequest) returns (Session);
rpc SignIn(SignInRequest) returns (Session);
rpc SignOut(SignOutRequest) returns (google.protobuf.Empty);
rpc GetUser(GetUserRequest) returns (User);
rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
```

The custom HTTP bindings are collection/resource verbs, not ad-hoc top-level
routes:

```text
POST /v1/{parent=projects/*}/auth/users:signUp
POST /v1/{parent=projects/*}/auth/sessions:signIn
POST /v1/{name=projects/*/auth/sessions/*}:signOut
```

Passwords never appear in a `User` resource. They are input-only fields on
auth request messages, stored as Argon2id hashes, and excluded from logs,
events, admin metadata, and generated resource SDK models. Refresh tokens are
stored hashed and rotated on use. Access tokens are short-lived and their
issuer, audience, project, subject, expiry, and key ID are validated before a
principal is constructed.

## Policy Model

Policies are method-level authorization checks generated from DSL. MVP policy
forms:

```yaml
allow: public
allow: authenticated
allow:
  role: admin
allow:
  owner:
    field: author
allow:
  all:
    - authenticated
    - owner:
        field: author
```

Generated handler order:

1. authenticate request
2. parse resource name/parent
3. validate request shape
4. run method-level pre-read policy
5. read existing row when needed
6. run row-level policy
7. execute mutation/query
8. emit event
9. return AIP response or canonical error

Policy evaluation happens in the server runtime. Client SDK checks may improve
UX but are not security boundaries.

## Error Contract

All failures originate as a canonical `google.rpc.Status`. The HTTP/JSON layer
transcodes the same status rather than inventing a second error format.

| Condition | Canonical code | Required detail |
|-----------|----------------|-----------------|
| Invalid resource name, filter, mask, or ID | `INVALID_ARGUMENT` | `BadRequest` field violations |
| Missing or invalid credentials | `UNAUTHENTICATED` | `ErrorInfo` reason |
| Authenticated but policy denies access | `PERMISSION_DENIED` | `ErrorInfo` without secret row data |
| Resource does not exist | `NOT_FOUND` | `ResourceInfo` when disclosure is safe |
| Duplicate resource name | `ALREADY_EXISTS` | `ResourceInfo` |
| Stale etag or serialization conflict | `ABORTED` | `ErrorInfo` with retry guidance |
| Child resources block deletion | `FAILED_PRECONDITION` | `PreconditionFailure` |
| Pool exhaustion, SQLite busy timeout, or temporary database failure | `UNAVAILABLE` | retryable `ErrorInfo` |
| Unexpected runtime failure | `INTERNAL` | opaque request ID; no SQL or filesystem details |

Policy evaluation may intentionally return `NOT_FOUND` instead of
`PERMISSION_DENIED` when revealing resource existence would leak information.
The rule is declared by policy and applied consistently to get, update, and
delete.

## Realtime

Realtime is API-level and uses the transactional outbox in both backends. It
does not depend on PostgreSQL logical replication or SQLite file observation:

```text
generated mutation handler
  -> backend transaction
  -> write resource row
  -> write _litebase_events row
  -> commit
  -> backend wake-up mechanism
  -> event worker reads durable event
  -> subscribed clients receive event
```

Event resource:

```text
projects/{project}/databases/{database}/events/{event}
```

Realtime guarantees:

- Events are emitted for writes through generated handlers.
- Events include resource name, method, event type, etag, and commit time.
- PostgreSQL uses `NOTIFY` only to wake workers; missed notifications do not
  lose durable events.
- SQLite workers poll the event cursor or receive an in-process wake-up.
- Direct SQL writes do not emit events.
- Delivery is at-least-once; clients should dedupe by event name.

Each PostgreSQL runtime instance has a unique consumer ID and durable cursor in
`_litebase_event_consumers`. Every instance advances its own cursor so events
reach WebSocket clients connected to every node. Events use a monotonically
ordered backend sequence; timestamps are metadata, not ordering keys. Retention
keeps a reconnect window and expires abandoned consumer cursors by lease.

WebSocket subscribe request:

```json
{
  "parent": "projects/acme/databases/main",
  "resource_type": "example.litebase.dev/Post",
  "filter": "author = \"projects/acme/auth/users/me\""
}
```

## Storage

Objects are not stored as SQL blobs in MVP. The selected database stores
metadata; bytes go to local disk or S3-compatible storage.

Resources:

```text
projects/{project}/storage/buckets/{bucket}
projects/{project}/storage/buckets/{bucket}/objects/{object}
```

Object metadata table:

```sql
create table _litebase_storage_objects (
  name text primary key,
  bucket text not null,
  object_id text not null,
  owner text,
  content_type text,
  size_bytes integer not null,
  etag text not null,
  create_time text not null,
  update_time text not null
);
```

Object bytes are addressed by content hash or object name under the storage
backend. Object metadata methods follow AIP standard methods; upload/download
URLs are custom methods.

## Generated SDK

TypeScript SDK should be generated from the same IR/proto:

```ts
const client = new LitebaseClient({ endpoint, token });

const post = await client.posts.create({
  parent: "projects/acme/databases/main",
  postId: "hello",
  post: {
    title: "Hello",
    body: "First post",
  },
});

const page = await client.posts.list({
  parent: "projects/acme/databases/main",
  filter: 'published = true',
  orderBy: "update_time desc",
  pageSize: 50,
});

const unsubscribe = client.posts.subscribe({
  parent: "projects/acme/databases/main",
  filter: 'author = "projects/acme/auth/users/u1"',
}, (event) => {
  console.log(event);
});
```

SDK method names can be ergonomic, but the underlying request/response messages
must remain AIP-shaped.

## Open UI IR Integration

Litebase and Open UI IR remain separate compiler layers. Litebase owns the data
and service contract; Open UI IR owns renderer-neutral application intent.

```text
Litebase semantic IR
  +--> proto / REST / PostgreSQL / SQLite / SDK
  +--> resource capability manifest
                              |
Open UI IR document ----------+
  +--> AntD / Mantine / mobile / TUI targets
```

The capability manifest exposes resource fields, enum labels, readable and
writable field behavior, filter operators, orderable fields, method names, and
auth requirements. Open UI IR may consume it to validate bindings and generate
CRUD screens, but backend policy remains authoritative. Litebase must not embed
AntD, Mantine, or another renderer dependency.

## Repository Ownership

The design may incubate in this repository, but implementation should live in a
dedicated Litebase repository. A backend runtime, migration engine, auth system,
and generated SDK release cycle are materially different from Open UI IR's
renderer compiler lifecycle.

The integration boundary should be one small package in this workspace that
consumes Litebase capability manifests. Neither repository imports the other's
compiler internals. This avoids forcing frontend users to install database
drivers, tonic, auth, or server dependencies and allows either project to
version independently.

## Admin Console

The admin console is generated from DSL metadata:

- resource browser
- row/resource editor
- migration history
- auth users and sessions
- policy inspector
- realtime event log
- storage bucket/object browser
- generated API docs

Admin actions use the same generated service handlers where possible. Any
privileged admin-only APIs must still have explicit resource names and auth
checks.

## CLI

Initial commands:

```bash
litebase init
litebase check litebase.yaml
litebase generate proto --out gen/proto
litebase generate sql --backend postgresql --out migrations/postgresql
litebase generate sql --backend sqlite --out migrations/sqlite
litebase migrate --runtime litebase.runtime.yaml
litebase serve --runtime litebase.runtime.yaml --config litebase.yaml
litebase console --runtime litebase.runtime.yaml
```

Backend credentials and deployment topology do not belong in the portable API
DSL. They live in a separate runtime configuration:

```yaml
runtime_version: litebase.runtime/v1alpha1
backend:
  kind: postgresql
  url_env: DATABASE_URL
  isolation: schema
pool:
  max_connections: 20
```

Local development may select SQLite instead:

```yaml
runtime_version: litebase.runtime/v1alpha1
backend:
  kind: sqlite
  data_dir: ./.litebase/data
  single_process: true
```

`litebase check` must fail on:

- missing resource patterns
- table-like public API declarations
- resources without `Get` or `List` unless singleton
- update methods without field masks
- list methods without pagination
- filters/order_by over unindexed fields when required
- invalid auth policies
- custom methods that duplicate standard methods
- generated proto failing AIP lint

## Runtime Architecture

```text
HTTP/gRPC server
    |
    v
auth middleware
    |
    v
AIP request parser
    |
    v
resource name parser
    |
    v
policy engine
    |
    v
generated repository
    |
    v
backend-neutral transaction plan
    |
    +--> PostgreSQL repository
    |      +--> app tables + event outbox
    +--> SQLite repository
           +--> app tables + event outbox
```

Recommended first backend stack:

- Rust
- Axum or tonic plus HTTP transcoding layer
- SQLx PostgreSQL and SQLite drivers behind explicit repository implementations
- PostgreSQL connection pooling and advisory migration locks
- SQLite WAL mode for the embedded profile
- TypeScript SDK generator
- React admin console

Rust is preferred for one runtime implementation with explicit transaction and
type mapping across both SQL backends.

## Proposed Package Boundaries

```text
crates/
  litebase-ir          versioned semantic IR and diagnostics
  litebase-dsl         YAML/JSON parser and normalization
  litebase-aip         AIP validation and proto descriptors
  litebase-store       backend-neutral plans and repository contracts
  litebase-postgres    PostgreSQL SQL, migrations, pools, repositories
  litebase-sqlite      SQLite SQL, migrations, files, repositories
  litebase-policy      typed policy compiler and evaluator
  litebase-runtime     auth, handlers, transactions, realtime
  litebase-codegen     proto, OpenAPI, TypeScript, Open UI IR manifests
  litebase-cli         check, generate, migrate, serve
packages/
  sdk-typescript       generated runtime client support
  admin-console        optional admin application
```

Dependencies point inward toward `litebase-ir`. The DSL package cannot be used
by runtime handlers, and PostgreSQL or SQLite details cannot appear in generated
public API descriptors. Backend crates must pass the same repository
conformance suite.

## MVP Scope

MVP should include:

- YAML DSL parser
- AIP conformance validator
- proto/message/service generator
- HTTP transcoding route generator
- PostgreSQL migration generator and production runtime
- SQLite migration generator and single-node compatibility runtime
- runtime CRUD handlers for generated resources
- email/password auth
- owner/authenticated/public policies
- keyset pagination
- safe filter subset
- update masks
- etags
- API-level realtime event log and WebSocket subscription
- local disk storage metadata
- TypeScript SDK
- minimal admin console

MVP should not include:

- OAuth providers
- multi-primary replication
- arbitrary SQL API
- GraphQL
- full CEL policy engine
- serverless function runtime
- hosted control plane billing
- offline sync conflict resolution

## Deferred Decisions

These do not block the first vertical slice:

- Storage upload transport: direct streaming through the runtime first, with
  signed URLs added when an S3-compatible backend is enabled.
- Realtime transport: event records are AIP resources; WebSocket subscribe is a
  transport extension with an HTTP list-events fallback.
- Filter language growth: implement the documented AIP subset first. CEL is not
  accepted in public filters; it may later be considered for server-side policy
  expressions.
- Cross-logical-database transactions: excluded from V1 because they weaken
  isolation and cannot be represented consistently across PostgreSQL schema,
  dedicated-database, and SQLite-file profiles.
- Hosted control plane: deployment, billing, quotas, and fleet management are a
  separate product layer.

## Immediate Next Steps

1. Keep `Litebase` as the design codename; choose the public name before the
   first published package.
2. Define `litebase.dsl/v1alpha1` JSON Schema and the normalized
   `litebase.ir/v1alpha1` Rust types.
3. Add a lock-file format for proto field numbers and SQL identities.
4. Implement `litebase check` for one resource, its name pattern, standard
   methods, indexes, and policies.
5. Generate one proto plus HTTP annotations and pass it through API Linter.
6. Define backend repository conformance tests for type mapping, transactions,
   etags, keyset pagination, filters, and the event outbox.
7. Generate initial PostgreSQL and SQLite migrations from one logical plan.
8. Build the `Post` vertical slice on PostgreSQL first: Create, Get, List,
   Update, Delete, auth, etag, and event outbox.
9. Run the same vertical slice against SQLite and reject unsupported deployment
   capabilities at startup.
10. Generate a TypeScript client and Open UI IR capability manifest from the
   same semantic IR.
