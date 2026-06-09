export const PROTOCOL_VERSION = "open-ui-ir.v1";

export type LayoutKind = "crud_list" | "detail_page" | "dashboard";
export type ComponentKind =
  | "filter_bar"
  | "table"
  | "detail_header"
  | "metric_row"
  | "chart"
  | "chart_grid";
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
}

export interface ResourceFieldSpec {
  name: string;
  value_type: "string" | "number" | "boolean" | "datetime" | "json";
  renderer: string;
  required: boolean;
  output_only: boolean;
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

export interface QueryBinding {
  transport: "graphql" | "rest";
  operation: string;
  result_path: string;
  variables: Record<string, unknown>;
}

export interface UiRouteSpec {
  route: string;
  title: string;
  layout: LayoutKind;
  navigation?: NavigationSpec;
  data_bindings: DataBinding[];
  components: ComponentSpec[];
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
  kind: ComponentKind | string;
  data_ref?: string;
  props: ComponentProps;
}

export type ComponentProps =
  | Record<string, unknown>
  | ChartComponentProps
  | MetricRowProps
  | TableComponentProps
  | DetailHeaderComponentProps;

export interface TableComponentProps {
  table: TableSpec;
}

export interface TableSpec {
  collection: string;
  columns: TableColumnSpec[];
  row_navigation?: string;
  row_actions?: string[];
  bulk_actions?: string[];
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
  data_ref: string;
  table: TableSpec;
}

export interface TimelineSpec {
  data_ref: string;
  title_field: string;
  time_field: string;
  description_field?: string;
}

export interface MetricRowProps {
  metrics: MetricSpec[];
}

export interface MetricSpec {
  id: string;
  label: string;
  value_path: string;
  format?: "number" | "percent" | "currency" | "duration" | "datetime";
}

export interface ChartComponentProps {
  chart: ChartSpec;
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
  value_path: "$form.update_mask";
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
