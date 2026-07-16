export const PROTOCOL_VERSION = "open-ui-ir.v1";

export type LayoutKind = "crud_list" | "detail_page" | "dashboard";
export type ComponentKind =
  | "filter_bar"
  | "table"
  | "detail_header"
  | "metric_row"
  | "chart"
  | "chart_grid"
  | "video";
export type ChartKind =
  | "line"
  | "bar"
  | "area"
  | "pie"
  | "heatmap"
  | "scatter"
  | "radar"
  | "rose"
  | "radial_bar"
  | "funnel"
  | "treemap"
  | "word_cloud"
  | "gauge"
  | "liquid";
export type FilterKind = "text" | "select" | "multi_select" | "date_range" | "boolean";
export type ActionMethod = "get" | "create" | "update" | "delete" | "custom";
export type SortDirection = "asc" | "desc";
export type FormControlKind = "text" | "textarea" | "number" | "checkbox" | "select" | "multi_select" | "date_time" | "json";
export type SelectionMode = "none" | "single" | "multiple";
export type SubmitPresentation = "inline" | "modal" | "confirm";
export type OptimisticUpdateMode = "none" | "prepend_resource" | "replace_resource" | "patch_resource" | "remove_resource";
export type UnauthorizedPresentation = "hide" | "disable" | "redact" | "deny";
export type VideoFit = "contain" | "cover";

export type AuthRequirement =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; permission: string }
  | { kind: "role"; role: string }
  | { kind: "all"; requirements: AuthRequirement[] }
  | { kind: "any"; requirements: AuthRequirement[] };

export interface RouteAuthPolicy {
  requirement: AuthRequirement;
  fallback?: string;
  denied_message?: string;
  unauthorized?: Extract<UnauthorizedPresentation, "hide" | "deny">;
}

export interface CollectionAuthPolicy {
  read?: AuthRequirement;
}

export interface FieldAuthPolicy {
  read?: AuthRequirement;
  write?: AuthRequirement;
  unauthorized?: Extract<UnauthorizedPresentation, "hide" | "redact">;
}

export interface ActionAuthPolicy {
  invoke?: AuthRequirement;
  unauthorized?: Extract<UnauthorizedPresentation, "hide" | "disable">;
}

export interface OpenUiDocument {
  protocol_version: typeof PROTOCOL_VERSION;
  app_name: string;
  display_name: string;
  default_locale?: string;
  locales?: LocaleSpec[];
  messages?: Record<string, Record<string, string>>;
  capabilities: CapabilitySet;
  collections: ResourceCollectionSpec[];
  routes: UiRouteSpec[];
}

export interface LocaleSpec {
  locale: string;
  label: string;
}

export interface CapabilitySet {
  layouts: LayoutKind[];
  component_kinds: string[];
  field_renderers: FieldRendererSpec[];
  filter_kinds: FilterKind[];
  action_methods: ActionMethod[];
}

export interface FieldRendererSpec {
  kind: string;
  description: string;
}

export interface ResourceCollectionSpec {
  name: string;
  resource_type: string;
  plural_field: string;
  list: QueryBinding;
  get?: QueryBinding;
  fields: ResourceFieldSpec[];
  filters: FilterSpec[];
  actions: ActionSpec[];
  pagination: PaginationSpec;
  auth?: CollectionAuthPolicy;
}

export interface ResourceFieldSpec {
  name: string;
  value_type: "string" | "number" | "boolean" | "datetime" | "json";
  renderer: string;
  required: boolean;
  output_only: boolean;
  auth?: FieldAuthPolicy;
}

export interface PaginationSpec {
  kind: "keyset";
  page_size_param: "page_size";
  page_token_param: "page_token";
  next_page_token_path: string;
  order_by: SortKey[];
  unique_key_fields: string[];
}

export interface SortKey {
  field: string;
  direction: SortDirection;
}

export interface KeysetPageToken {
  version: 1;
  collection: string;
  order_by: SortKey[];
  request_fingerprint: string;
  keys: KeysetValue[];
}

export type KeysetValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "datetime"; value: string }
  | { type: "uuid"; value: string };

export interface FilterSpec {
  name: string;
  label: string;
  kind: FilterKind;
  cel_field: string;
  options?: FilterOption[];
}

export interface FilterOption {
  label: string;
  value: string;
}

export type BindingValue =
  | { kind: "literal"; value: unknown }
  | { kind: "route"; path: string }
  | { kind: "resource"; path: string }
  | { kind: "form"; path?: string }
  | { kind: "page"; path: "page_size" | "page_token" }
  | { kind: "filters"; path?: string };

export interface ResultPath {
  path: string;
}

export interface DataRef {
  binding: string;
  path?: string;
}

export interface QueryBinding {
  transport: "graphql" | "rest";
  operation: string;
  result: ResultPath;
  variables: Record<string, BindingValue>;
}

export interface UiRouteSpec {
  route: string;
  title: string;
  layout: LayoutKind;
  navigation?: NavigationSpec;
  data_bindings: DataBinding[];
  components: RouteComponentSpec[];
  auth?: RouteAuthPolicy;
}

export interface NavigationSpec {
  group: string;
  order: number;
}

export interface DataBinding {
  name: string;
  query: QueryBinding;
}

export interface ComponentSpec {
  id: string;
  kind: ComponentKind;
  data?: DataRef;
}

export type RouteComponentSpec =
  | FilterBarComponentSpec
  | TableComponentSpec
  | DetailHeaderComponentSpec
  | MetricRowComponentSpec
  | ChartComponentSpec
  | ChartGridComponentSpec
  | VideoComponentSpec;

export interface FilterBarComponentSpec extends ComponentSpec {
  kind: "filter_bar";
  collection: string;
}

export interface TableComponentSpec extends ComponentSpec {
  kind: "table";
  table: TableSpec;
}

export interface DetailHeaderComponentSpec extends ComponentSpec {
  kind: "detail_header";
  detail: DetailSpec;
}

export interface MetricRowComponentSpec extends ComponentSpec {
  kind: "metric_row";
  metrics: MetricSpec[];
}

export interface ChartComponentSpec extends ComponentSpec {
  kind: "chart";
  chart: ChartSpec;
}

export interface ChartGridComponentSpec extends ComponentSpec {
  kind: "chart_grid";
  columns?: number;
  chart_refs: string[];
}

export interface VideoComponentSpec extends ComponentSpec {
  kind: "video";
  video: VideoSpec;
}

export interface VideoSpec {
  src?: string;
  sources?: VideoSourceSpec[];
  title?: string;
  caption?: string;
  poster?: string;
  controls?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  plays_inline?: boolean;
  fit?: VideoFit;
  aspect_ratio?: string;
}

export interface VideoSourceSpec {
  src: string;
  type?: string;
}

export interface TableSpec {
  collection: string;
  columns: TableColumnSpec[];
  selection?: TableSelectionSpec;
  row_navigation?: string;
  row_actions?: string[];
  bulk_actions?: string[];
  mobile?: TableMobileSpec;
}

export interface TableSelectionSpec {
  mode: SelectionMode;
  required_for_bulk_actions?: boolean;
}

export interface TableColumnSpec {
  id: string;
  field: string;
  label?: string;
  sortable?: boolean;
  visible?: boolean;
  width?: number;
  align?: "start" | "center" | "end";
}

export interface TableMobileSpec {
  presentation: "table" | "cards";
  primary_field: string;
  secondary_field?: string;
  metadata_fields?: string[];
  action_display?: "inline" | "menu";
}

export interface DetailHeaderComponentProps {
  detail: DetailSpec;
}

export interface DetailSpec {
  collection: string;
  title_field: string;
  subtitle_field?: string;
  status_field?: string;
  actions?: string[];
  sections?: DetailSectionSpec[];
  tabs?: DetailTabSpec[];
  related?: RelatedResourceSpec[];
  timeline?: TimelineSpec;
  mobile?: DetailMobileSpec;
}

export interface DetailMobileSpec {
  sections_presentation?: "stack" | "tabs";
  related_presentation?: "stack" | "tabs";
  sticky_actions?: boolean;
}

export interface DetailSectionSpec {
  id: string;
  label: string;
  fields: string[];
}

export interface DetailTabSpec {
  id: string;
  label: string;
  sections?: string[];
  related?: string[];
}

export interface RelatedResourceSpec {
  id: string;
  label: string;
  collection: string;
  data: DataRef;
  table: TableSpec;
}

export interface TimelineSpec {
  data: DataRef;
  title_field: string;
  time_field: string;
  description_field?: string;
}

export interface MetricSpec {
  id: string;
  label: string;
  value_path: string;
  format?: "number" | "percent" | "currency" | "duration" | "datetime";
}

export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  encoding: ChartEncoding;
  height?: number;
  stack?: boolean;
  smooth?: boolean;
}

export interface ChartEncoding {
  x?: string;
  y?: string;
  value?: string;
  category?: string;
  color?: string;
  size?: string;
}

export interface ActionSpec {
  name: string;
  label: string;
  method: ActionMethod;
  binding: QueryBinding;
  form?: ActionFormSpec;
  interaction?: ActionInteractionSpec;
  auth?: ActionAuthPolicy;
}

export interface ActionInteractionSpec {
  confirmation?: ConfirmationSpec;
  submit?: SubmitSpec;
  outcome?: ActionOutcomeSpec;
  optimistic_update?: OptimisticUpdateSpec;
}

export interface ConfirmationSpec {
  title: string;
  message: string;
  confirm_label?: string;
  cancel_label?: string;
  destructive?: boolean;
}

export interface SubmitSpec {
  presentation: SubmitPresentation;
  pending_message?: string;
  disable_while_pending?: boolean;
}

export interface ActionOutcomeSpec {
  success_message?: string;
  failure_message?: string;
  refresh_bindings?: string[];
}

export interface OptimisticUpdateSpec {
  mode: OptimisticUpdateMode;
}

export interface ActionFormSpec {
  fields: FormFieldSpec[];
  update_mask?: UpdateMaskSpec;
}

export interface FormFieldSpec {
  field: string;
  label?: string;
  control: FormControlKind;
  required?: boolean;
  options?: FilterOption[];
}

export interface UpdateMaskSpec {
  variable: string;
  value: Extract<BindingValue, { kind: "form" }>;
}

export function resourceName(collection: string, id: string): string {
  return `${collection.replace(/^\/+|\/+$/g, "")}/${id.replace(/^\/+|\/+$/g, "")}`;
}

export function encodeKeysetPageToken(token: KeysetPageToken): string {
  validateKeysetPageToken(token);
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
}

export function decodeKeysetPageToken(token: string): KeysetPageToken | null {
  if (token.trim() === "") return null;
  const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as KeysetPageToken;
  validateKeysetPageToken(parsed);
  return parsed;
}

export function validateKeysetPageToken(token: KeysetPageToken): void {
  if (token.version !== 1) throw new Error(`unsupported page token version: ${token.version}`);
  if (token.order_by.length === 0) throw new Error("page token order_by must not be empty");
  if (token.keys.length !== token.order_by.length) {
    throw new Error("page token keys must match order_by length");
  }
}

export function keysetPredicateSql(orderBy: SortKey[], firstPlaceholder = 1): string {
  if (orderBy.length === 0) throw new Error("order_by must not be empty");
  return orderBy
    .map((key, i) => {
      const equals = orderBy
        .slice(0, i)
        .map((prev, j) => `${prev.field} = $${firstPlaceholder + j}`);
      const op = key.direction === "asc" ? ">" : "<";
      return [...equals, `${key.field} ${op} $${firstPlaceholder + i}`].join(" AND ");
    })
    .map((clause) => `(${clause})`)
    .join(" OR ");
}
