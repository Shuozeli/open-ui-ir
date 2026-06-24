import type {
  ActionMethod,
  ChartKind,
  ComponentSpec,
  FilterKind,
  FormControlKind,
  LayoutKind,
  OpenUiDocument,
  OptimisticUpdateMode,
  QueryBinding,
  ResourceFieldSpec,
  ResourceCollectionSpec,
  DetailSpec,
  TableSpec,
  UiRouteSpec,
  BindingValue,
} from "@open-ui-ir/protocol";
import { PROTOCOL_VERSION } from "@open-ui-ir/protocol";

export type DiagnosticSeverity = "error" | "warning";

const chartKinds = new Set<ChartKind>([
  "line",
  "bar",
  "area",
  "pie",
  "heatmap",
  "scatter",
  "radar",
  "rose",
  "radial_bar",
  "funnel",
  "treemap",
  "word_cloud",
  "gauge",
  "liquid",
]);

const controlsByValueType: Record<ResourceFieldSpec["value_type"], Set<FormControlKind>> = {
  string: new Set(["text", "textarea", "select", "multi_select"]),
  number: new Set(["number", "select"]),
  boolean: new Set(["checkbox", "select"]),
  datetime: new Set(["date_time"]),
  json: new Set(["json", "textarea"]),
};

const optimisticModes = new Set<OptimisticUpdateMode>([
  "none",
  "prepend_resource",
  "replace_resource",
  "patch_resource",
  "remove_resource",
]);

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path: string;
}

export interface CompileContext {
  document: OpenUiDocument;
  diagnostics: Diagnostic[];
}

export interface CompileOutput {
  target: string;
  files: Array<{ path: string; content: string }>;
  diagnostics: Diagnostic[];
}

export interface TargetManifest {
  name: string;
  layouts: LayoutKind[];
  component_kinds: string[];
  field_renderers: string[];
  filter_kinds: FilterKind[];
  action_methods: ActionMethod[];
  chart_kinds: ChartKind[];
  transports: Array<QueryBinding["transport"]>;
}

export interface CompilerTarget {
  name: string;
  manifest?: TargetManifest;
  compile(context: CompileContext): CompileOutput;
}

export function compileDocument(document: OpenUiDocument, target: CompilerTarget): CompileOutput {
  const diagnostics = [
    ...validateDocument(document),
    ...(target.manifest ? validateTargetCompatibility(document, target.manifest) : []),
  ];
  const result = target.compile({ document, diagnostics });
  return {
    ...result,
    diagnostics: [...diagnostics, ...result.diagnostics],
  };
}

export function validateDocument(document: OpenUiDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (document.protocol_version !== PROTOCOL_VERSION) {
    diagnostics.push(error("protocol_version", `expected ${PROTOCOL_VERSION}`, "/protocol_version"));
  }

  const collections = new Map(document.collections.map((collection) => [collection.name, collection]));

  const routeSet = new Set<string>();
  document.routes.forEach((route, index) => {
    if (routeSet.has(route.route)) {
      diagnostics.push(error("duplicate_route", `duplicate route ${route.route}`, `/routes/${index}/route`));
    }
    routeSet.add(route.route);
    requireLayout(document, route, index, diagnostics);
    requireComponents(document, route, index, diagnostics);
    requireRouteBindings(route, index, diagnostics);
    route.data_bindings.forEach((binding, bindingIndex) => {
      requireQueryBinding(binding.query, `/routes/${index}/data_bindings/${bindingIndex}/query`, diagnostics);
    });
    requireComponentReferences(collections, route, index, diagnostics);
  });

  const collectionSet = new Set<string>();
  document.collections.forEach((collection, index) => {
    if (collectionSet.has(collection.name)) {
      diagnostics.push(
        error("duplicate_collection", `duplicate collection ${collection.name}`, `/collections/${index}/name`),
      );
    }
    collectionSet.add(collection.name);
    requireResourceName(collection, index, diagnostics);
    requireFieldRenderers(document, collection, index, diagnostics);
    requireFilterCapabilities(document, collection, index, diagnostics);
    requireFilterFields(collection, index, diagnostics);
    requireActionCapabilities(document, collection, index, diagnostics);
    requireActionForms(collection, index, diagnostics);
    requireActionInteractions(collection, index, diagnostics);
    requireQueryBinding(collection.list, `/collections/${index}/list`, diagnostics);
    if (collection.get !== undefined) {
      requireQueryBinding(collection.get, `/collections/${index}/get`, diagnostics);
    }
    collection.actions.forEach((action, actionIndex) => {
      requireQueryBinding(action.binding, `/collections/${index}/actions/${actionIndex}/binding`, diagnostics);
    });
    requirePaginationFields(collection, index, diagnostics);
    requireKeysetTieBreaker(collection, index, diagnostics);
  });

  return diagnostics;
}

function requireQueryBinding(binding: QueryBinding, path: string, diagnostics: Diagnostic[]): void {
  if (binding.result === undefined || typeof binding.result.path !== "string" || binding.result.path.trim() === "") {
    diagnostics.push(error("invalid_result_path", "binding result.path must be a non-empty string", `${path}/result/path`));
  }

  Object.entries(binding.variables).forEach(([name, value]) => {
    if (!isBindingValue(value)) {
      diagnostics.push(
        error("invalid_binding_value", `binding variable ${name} must use a typed binding value`, `${path}/variables/${name}`),
      );
    }
  });
}

function isBindingValue(value: unknown): value is BindingValue {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const binding = value as { kind?: unknown; path?: unknown };
  switch (binding.kind) {
    case "literal":
      return "value" in binding;
    case "route":
    case "resource":
      return typeof binding.path === "string" && binding.path.length > 0;
    case "form":
    case "filters":
      return binding.path === undefined || typeof binding.path === "string";
    case "page":
      return binding.path === "page_size" || binding.path === "page_token";
    default:
      return false;
  }
}

export function validateTargetCompatibility(document: OpenUiDocument, target: TargetManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layouts = new Set(target.layouts);
  const componentKinds = new Set(target.component_kinds);
  const fieldRenderers = new Set(target.field_renderers);
  const filterKinds = new Set(target.filter_kinds);
  const actionMethods = new Set(target.action_methods);
  const supportedChartKinds = new Set(target.chart_kinds);
  const transports = new Set(target.transports);

  document.routes.forEach((route, routeIndex) => {
    if (!layouts.has(route.layout as LayoutKind)) {
      diagnostics.push(
        error(
          "target_unsupported_layout",
          `target ${target.name} does not support layout ${route.layout}`,
          `/routes/${routeIndex}/layout`,
        ),
      );
    }
    route.data_bindings.forEach((binding, bindingIndex) => {
      if (!transports.has(binding.query.transport)) {
        diagnostics.push(
          error(
            "target_unsupported_transport",
            `target ${target.name} does not support ${binding.query.transport} bindings`,
            `/routes/${routeIndex}/data_bindings/${bindingIndex}/query/transport`,
          ),
        );
      }
    });
    route.components.forEach((component, componentIndex) => {
      if (!componentKinds.has(component.kind)) {
        diagnostics.push(
          error(
            "target_unsupported_component",
            `target ${target.name} does not support component ${component.kind}`,
            `/routes/${routeIndex}/components/${componentIndex}/kind`,
          ),
        );
      }
      const chartKind = chartKindProp(component);
      if (chartKind !== undefined && !supportedChartKinds.has(chartKind as ChartKind)) {
        diagnostics.push(
          error(
            "target_unsupported_chart",
            `target ${target.name} does not support chart ${chartKind}`,
            `/routes/${routeIndex}/components/${componentIndex}/chart/kind`,
          ),
        );
      }
    });
  });

  document.collections.forEach((collection, collectionIndex) => {
    if (!transports.has(collection.list.transport)) {
      diagnostics.push(
        error(
          "target_unsupported_transport",
          `target ${target.name} does not support ${collection.list.transport} bindings`,
          `/collections/${collectionIndex}/list/transport`,
        ),
      );
    }
    if (collection.get !== undefined && !transports.has(collection.get.transport)) {
      diagnostics.push(
        error(
          "target_unsupported_transport",
          `target ${target.name} does not support ${collection.get.transport} bindings`,
          `/collections/${collectionIndex}/get/transport`,
        ),
      );
    }
    collection.fields.forEach((field, fieldIndex) => {
      if (!fieldRenderers.has(field.renderer)) {
        diagnostics.push(
          error(
            "target_unsupported_field_renderer",
            `target ${target.name} does not support renderer ${field.renderer}`,
            `/collections/${collectionIndex}/fields/${fieldIndex}/renderer`,
          ),
        );
      }
    });
    collection.filters.forEach((filter, filterIndex) => {
      if (!filterKinds.has(filter.kind as FilterKind)) {
        diagnostics.push(
          error(
            "target_unsupported_filter",
            `target ${target.name} does not support filter ${filter.kind}`,
            `/collections/${collectionIndex}/filters/${filterIndex}/kind`,
          ),
        );
      }
    });
    collection.actions.forEach((action, actionIndex) => {
      if (!actionMethods.has(action.method as ActionMethod)) {
        diagnostics.push(
          error(
            "target_unsupported_action",
            `target ${target.name} does not support action ${action.method}`,
            `/collections/${collectionIndex}/actions/${actionIndex}/method`,
          ),
        );
      }
      if (!transports.has(action.binding.transport)) {
        diagnostics.push(
          error(
            "target_unsupported_transport",
            `target ${target.name} does not support ${action.binding.transport} bindings`,
            `/collections/${collectionIndex}/actions/${actionIndex}/binding/transport`,
          ),
        );
      }
    });
  });

  return diagnostics;
}

function requireLayout(
  document: OpenUiDocument,
  route: UiRouteSpec,
  index: number,
  diagnostics: Diagnostic[],
): void {
  if (!document.capabilities.layouts.includes(route.layout as LayoutKind)) {
    diagnostics.push(
      error("unsupported_layout", `layout ${route.layout} is not declared`, `/routes/${index}/layout`),
    );
  }
}

function requireComponents(
  document: OpenUiDocument,
  route: UiRouteSpec,
  routeIndex: number,
  diagnostics: Diagnostic[],
): void {
  for (const [componentIndex, component] of route.components.entries()) {
    if (!document.capabilities.component_kinds.includes(component.kind)) {
      diagnostics.push(
        error(
          "unsupported_component",
          `component ${component.kind} is not declared`,
          `/routes/${routeIndex}/components/${componentIndex}/kind`,
        ),
      );
    }
    if (component.kind === "chart") {
      requireChartProps(component, routeIndex, componentIndex, diagnostics);
    }
    if (component.kind === "table") {
      requireTableProps(component, routeIndex, componentIndex, diagnostics);
    }
    if (component.kind === "detail_header") {
      requireDetailProps(component, routeIndex, componentIndex, diagnostics);
    }
  }
}

function requireResourceName(
  collection: ResourceCollectionSpec,
  index: number,
  diagnostics: Diagnostic[],
): void {
  if (!collection.fields.some((field) => field.name === "name" && field.required)) {
    diagnostics.push(error("missing_resource_name", "collection must expose required field name", `/collections/${index}`));
  }
}

function requireFieldRenderers(
  document: OpenUiDocument,
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  const renderers = new Set(document.capabilities.field_renderers.map((renderer) => renderer.kind));
  collection.fields.forEach((field, fieldIndex) => {
    if (!renderers.has(field.renderer)) {
      diagnostics.push(
        error(
          "unsupported_field_renderer",
          `renderer ${field.renderer} is not declared`,
          `/collections/${collectionIndex}/fields/${fieldIndex}/renderer`,
        ),
      );
    }
  });
}

function requireFilterCapabilities(
  document: OpenUiDocument,
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  collection.filters.forEach((filter, filterIndex) => {
    if (!document.capabilities.filter_kinds.includes(filter.kind as FilterKind)) {
      diagnostics.push(
        error(
          "unsupported_filter",
          `filter ${filter.kind} is not declared`,
          `/collections/${collectionIndex}/filters/${filterIndex}/kind`,
        ),
      );
    }
  });
}

function requireFilterFields(
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  const fields = fieldSet(collection);
  collection.filters.forEach((filter, filterIndex) => {
    const field = rootPath(filter.cel_field);
    if (!fields.has(field)) {
      diagnostics.push(
        error(
          "unknown_filter_field",
          `filter field ${filter.cel_field} is not in collection ${collection.name}`,
          `/collections/${collectionIndex}/filters/${filterIndex}/cel_field`,
        ),
      );
    }
  });
}

function requireActionCapabilities(
  document: OpenUiDocument,
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  collection.actions.forEach((action, actionIndex) => {
    if (!document.capabilities.action_methods.includes(action.method as ActionMethod)) {
      diagnostics.push(
        error(
          "unsupported_action_method",
          `action method ${action.method} is not declared`,
          `/collections/${collectionIndex}/actions/${actionIndex}/method`,
        ),
      );
    }
  });
}

function requireActionForms(
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  const fields = new Map(collection.fields.map((field) => [field.name, field]));
  collection.actions.forEach((action, actionIndex) => {
    if ((action.method === "create" || action.method === "update") && action.form === undefined) {
      diagnostics.push(
        error(
          "missing_action_form",
          `${action.method} action ${action.name} must declare a form schema`,
          `/collections/${collectionIndex}/actions/${actionIndex}/form`,
        ),
      );
      return;
    }

    if (action.form === undefined) return;

    const formFields = new Set<string>();
    action.form.fields.forEach((formField, formFieldIndex) => {
      if (formFields.has(formField.field)) {
        diagnostics.push(
          error(
            "duplicate_form_field",
            `duplicate form field ${formField.field}`,
            `/collections/${collectionIndex}/actions/${actionIndex}/form/fields/${formFieldIndex}/field`,
          ),
        );
      }
      formFields.add(formField.field);

      const collectionField = fields.get(formField.field);
      if (collectionField === undefined) {
        diagnostics.push(
          error(
            "unknown_form_field",
            `form field ${formField.field} is not in collection ${collection.name}`,
            `/collections/${collectionIndex}/actions/${actionIndex}/form/fields/${formFieldIndex}/field`,
          ),
        );
        return;
      }

      if (collectionField.output_only) {
        diagnostics.push(
          error(
            "output_only_form_field",
            `form field ${formField.field} is output-only`,
            `/collections/${collectionIndex}/actions/${actionIndex}/form/fields/${formFieldIndex}/field`,
          ),
        );
      }

      if (!controlsByValueType[collectionField.value_type].has(formField.control)) {
        diagnostics.push(
          error(
            "incompatible_form_control",
            `control ${formField.control} is incompatible with ${collectionField.value_type} field ${formField.field}`,
            `/collections/${collectionIndex}/actions/${actionIndex}/form/fields/${formFieldIndex}/control`,
          ),
        );
      }
    });

    if (action.method === "create") {
      collection.fields
        .filter((field) => field.required && !field.output_only && !formFields.has(field.name))
        .forEach((field) => {
          diagnostics.push(
            error(
              "missing_required_create_field",
              `create action ${action.name} form must include required field ${field.name}`,
              `/collections/${collectionIndex}/actions/${actionIndex}/form/fields`,
            ),
          );
        });
    }

    if (action.method === "update") {
      requireUpdateMask(collectionIndex, actionIndex, action.form.update_mask, action.binding, diagnostics);
    }
  });
}

function requireUpdateMask(
  collectionIndex: number,
  actionIndex: number,
  updateMask: { variable: string; value: BindingValue } | undefined,
  binding: QueryBinding,
  diagnostics: Diagnostic[],
): void {
  if (updateMask === undefined) {
    diagnostics.push(
      error(
        "missing_update_mask",
        "update action form must declare update_mask",
        `/collections/${collectionIndex}/actions/${actionIndex}/form/update_mask`,
      ),
    );
    return;
  }

  if (!(updateMask.variable in binding.variables)) {
    diagnostics.push(
      error(
        "unknown_update_mask_variable",
        `update mask variable ${updateMask.variable} is not bound`,
        `/collections/${collectionIndex}/actions/${actionIndex}/form/update_mask/variable`,
      ),
    );
    return;
  }

  if (!isFormUpdateMaskBinding(binding.variables[updateMask.variable])) {
    diagnostics.push(
      error(
        "invalid_update_mask_binding",
        `update mask variable ${updateMask.variable} must bind form.update_mask`,
        `/collections/${collectionIndex}/actions/${actionIndex}/binding/variables/${updateMask.variable}`,
      ),
    );
  }
}

function isFormUpdateMaskBinding(value: BindingValue | undefined): boolean {
  return value?.kind === "form" && value.path === "update_mask";
}

function requireActionInteractions(
  collection: ResourceCollectionSpec,
  collectionIndex: number,
  diagnostics: Diagnostic[],
): void {
  collection.actions.forEach((action, actionIndex) => {
    const interaction = action.interaction;
    const isMutating = action.method === "create" || action.method === "update" || action.method === "delete" || action.method === "custom";

    if ((action.method === "create" || action.method === "update") && interaction?.submit === undefined) {
      diagnostics.push(
        error(
          "missing_submit_lifecycle",
          `${action.method} action ${action.name} must declare submit lifecycle`,
          `/collections/${collectionIndex}/actions/${actionIndex}/interaction/submit`,
        ),
      );
    }

    if (isMutating && interaction?.outcome === undefined) {
      diagnostics.push(
        error(
          "missing_action_outcome",
          `${action.method} action ${action.name} must declare success/failure outcome copy`,
          `/collections/${collectionIndex}/actions/${actionIndex}/interaction/outcome`,
        ),
      );
    }

    if (action.method === "delete" && interaction?.confirmation?.destructive !== true) {
      diagnostics.push(
        error(
          "missing_destructive_confirmation",
          `delete action ${action.name} must declare destructive confirmation`,
          `/collections/${collectionIndex}/actions/${actionIndex}/interaction/confirmation`,
        ),
      );
    }

    if (interaction?.confirmation !== undefined) {
      if (interaction.confirmation.title.trim() === "" || interaction.confirmation.message.trim() === "") {
        diagnostics.push(
          error(
            "invalid_confirmation_copy",
            "confirmation title and message must be non-empty",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/confirmation`,
          ),
        );
      }
    }

    if (interaction?.outcome !== undefined) {
      if (
        interaction.outcome.success_message !== undefined &&
        interaction.outcome.success_message.trim() === ""
      ) {
        diagnostics.push(
          error(
            "invalid_success_message",
            "success_message must be non-empty when present",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/outcome/success_message`,
          ),
        );
      }
      if (
        interaction.outcome.failure_message !== undefined &&
        interaction.outcome.failure_message.trim() === ""
      ) {
        diagnostics.push(
          error(
            "invalid_failure_message",
            "failure_message must be non-empty when present",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/outcome/failure_message`,
          ),
        );
      }
    }

    if (interaction?.optimistic_update !== undefined) {
      const mode = interaction.optimistic_update.mode;
      if (!optimisticModes.has(mode as OptimisticUpdateMode)) {
        diagnostics.push(
          error(
            "unsupported_optimistic_update",
            `optimistic update mode ${mode} is not supported`,
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/optimistic_update/mode`,
          ),
        );
      }
      if (action.method === "get" && mode !== "none") {
        diagnostics.push(
          error(
            "invalid_optimistic_update",
            "get actions cannot declare optimistic resource updates",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/optimistic_update/mode`,
          ),
        );
      }
      if (action.method === "delete" && mode !== "none" && mode !== "remove_resource") {
        diagnostics.push(
          error(
            "invalid_optimistic_update",
            "delete actions can only use none or remove_resource optimistic updates",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/optimistic_update/mode`,
          ),
        );
      }
      if (action.method === "create" && mode !== "none" && mode !== "prepend_resource") {
        diagnostics.push(
          error(
            "invalid_optimistic_update",
            "create actions can only use none or prepend_resource optimistic updates",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/optimistic_update/mode`,
          ),
        );
      }
      if (
        action.method === "update" &&
        mode !== "none" &&
        mode !== "replace_resource" &&
        mode !== "patch_resource"
      ) {
        diagnostics.push(
          error(
            "invalid_optimistic_update",
            "update actions can only use none, replace_resource, or patch_resource optimistic updates",
            `/collections/${collectionIndex}/actions/${actionIndex}/interaction/optimistic_update/mode`,
          ),
        );
      }
    }
  });
}

function requirePaginationFields(
  collection: ResourceCollectionSpec,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const fields = fieldSet(collection);
  collection.pagination.order_by.forEach((key, keyIndex) => {
    if (!fields.has(key.field)) {
      diagnostics.push(
        error(
          "unknown_pagination_field",
          `pagination field ${key.field} is not in collection ${collection.name}`,
          `/collections/${index}/pagination/order_by/${keyIndex}/field`,
        ),
      );
    }
  });
  collection.pagination.unique_key_fields.forEach((field, fieldIndex) => {
    if (!fields.has(field)) {
      diagnostics.push(
        error(
          "unknown_unique_key_field",
          `unique key field ${field} is not in collection ${collection.name}`,
          `/collections/${index}/pagination/unique_key_fields/${fieldIndex}`,
        ),
      );
    }
  });
}

function requireKeysetTieBreaker(
  collection: ResourceCollectionSpec,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const orderFields = new Set(collection.pagination.order_by.map((key) => key.field));
  const hasUniqueKey = collection.pagination.unique_key_fields.some((field) => orderFields.has(field));
  if (!hasUniqueKey) {
    diagnostics.push(
      error(
        "missing_keyset_tie_breaker",
        "keyset pagination order_by must include at least one stable unique key",
        `/collections/${index}/pagination/order_by`,
      ),
    );
  }
}

function requireRouteBindings(route: UiRouteSpec, routeIndex: number, diagnostics: Diagnostic[]): void {
  const bindingNames = new Set<string>();
  route.data_bindings.forEach((binding, bindingIndex) => {
    if (bindingNames.has(binding.name)) {
      diagnostics.push(
        error(
          "duplicate_data_binding",
          `duplicate data binding ${binding.name}`,
          `/routes/${routeIndex}/data_bindings/${bindingIndex}/name`,
        ),
      );
    }
    bindingNames.add(binding.name);
  });
}

function requireComponentReferences(
  collections: Map<string, ResourceCollectionSpec>,
  route: UiRouteSpec,
  routeIndex: number,
  diagnostics: Diagnostic[],
): void {
  const bindingNames = new Set(route.data_bindings.map((binding) => binding.name));
  route.components.forEach((component, componentIndex) => {
    if (component.data !== undefined && !bindingNames.has(component.data.binding)) {
      diagnostics.push(
        error(
          "unknown_data_ref",
          `data binding ${component.data.binding} is not declared on the route`,
          `/routes/${routeIndex}/components/${componentIndex}/data/binding`,
        ),
      );
    }

    if (component.kind === "detail_header") {
      requireDetailBindingReferences(component, bindingNames, routeIndex, componentIndex, diagnostics);
    }

    const collection = collectionProp(component);
    if (collection !== undefined && !collections.has(collection)) {
      diagnostics.push(
        error(
          "unknown_collection_ref",
          `collection ${collection} is not declared`,
          `/routes/${routeIndex}/components/${componentIndex}/collection`,
        ),
      );
    }

    if (component.kind === "table") {
      const table = tableProp(component);
      if (table !== undefined) {
        const tableCollection = collections.get(table.collection);
        if (tableCollection !== undefined) {
          requireTableContract(table, tableCollection, routeIndex, componentIndex, diagnostics);
        }
      }
    }

    if (component.kind === "detail_header") {
      const detail = detailProp(component);
      if (detail !== undefined) {
        const detailCollection = collections.get(detail.collection);
        if (detailCollection !== undefined) {
          requireDetailContract(detail, collections, detailCollection, routeIndex, componentIndex, diagnostics);
        }
      }
    }
  });
}

function requireDetailBindingReferences(
  component: ComponentSpec,
  bindingNames: Set<string>,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const detail = detailProp(component);
  if (detail === undefined) return;

  detail.related?.forEach((related, relatedIndex) => {
    if (!bindingNames.has(related.data.binding)) {
      diagnostics.push(
        error(
          "unknown_related_data_ref",
          `related data binding ${related.data.binding} is not declared on the route`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/related/${relatedIndex}/data/binding`,
        ),
      );
    }
  });

  if (detail.timeline !== undefined && !bindingNames.has(detail.timeline.data.binding)) {
    diagnostics.push(
      error(
        "unknown_timeline_data_ref",
        `timeline data binding ${detail.timeline.data.binding} is not declared on the route`,
        `/routes/${routeIndex}/components/${componentIndex}/detail/timeline/data/binding`,
      ),
    );
  }
}

function requireDetailProps(
  component: ComponentSpec,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const detail = detailProp(component);
  if (detail === undefined) {
    diagnostics.push(
      error(
        "missing_detail_props",
        "detail_header component must include detail",
        `/routes/${routeIndex}/components/${componentIndex}/detail`,
      ),
    );
    return;
  }
  if (typeof detail.collection !== "string") {
    diagnostics.push(
      error(
        "missing_detail_collection",
        "detail component must declare detail.collection",
        `/routes/${routeIndex}/components/${componentIndex}/detail/collection`,
      ),
    );
  }
}

function requireDetailContract(
  detail: DetailSpec,
  collections: Map<string, ResourceCollectionSpec>,
  collection: ResourceCollectionSpec,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const fields = fieldSet(collection);
  const actions = new Map(collection.actions.map((action) => [action.name, action]));
  requireDetailField(detail.title_field, "unknown_detail_title_field", "title_field", fields, routeIndex, componentIndex, diagnostics);
  if (detail.subtitle_field !== undefined) {
    requireDetailField(detail.subtitle_field, "unknown_detail_subtitle_field", "subtitle_field", fields, routeIndex, componentIndex, diagnostics);
  }
  if (detail.status_field !== undefined) {
    requireDetailField(detail.status_field, "unknown_detail_status_field", "status_field", fields, routeIndex, componentIndex, diagnostics);
  }

  detail.actions?.forEach((actionName, actionIndex) => {
    if (!actions.has(actionName)) {
      diagnostics.push(
        error(
          "unknown_detail_action",
          `detail action ${actionName} is not declared on collection ${collection.name}`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/actions/${actionIndex}`,
        ),
      );
    }
  });

  const sectionIds = new Set<string>();
  detail.sections?.forEach((section, sectionIndex) => {
    if (sectionIds.has(section.id)) {
      diagnostics.push(
        error(
          "duplicate_detail_section",
          `duplicate detail section ${section.id}`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/sections/${sectionIndex}/id`,
        ),
      );
    }
    sectionIds.add(section.id);
    section.fields.forEach((field, fieldIndex) => {
      if (!fields.has(field)) {
        diagnostics.push(
          error(
            "unknown_detail_section_field",
            `detail section field ${field} is not in collection ${collection.name}`,
            `/routes/${routeIndex}/components/${componentIndex}/detail/sections/${sectionIndex}/fields/${fieldIndex}`,
          ),
        );
      }
    });
  });

  const relatedIds = new Set<string>();
  detail.related?.forEach((related, relatedIndex) => {
    if (relatedIds.has(related.id)) {
      diagnostics.push(
        error(
          "duplicate_related_resource",
          `duplicate related resource ${related.id}`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/related/${relatedIndex}/id`,
        ),
      );
    }
    relatedIds.add(related.id);
    const relatedCollection = collections.get(related.collection);
    if (relatedCollection === undefined) {
      diagnostics.push(
        error(
          "unknown_related_collection",
          `related collection ${related.collection} is not declared`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/related/${relatedIndex}/collection`,
        ),
      );
      return;
    }
    if (related.table.collection !== related.collection) {
      diagnostics.push(
        error(
          "mismatched_related_table_collection",
          `related table collection ${related.table.collection} must match ${related.collection}`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/related/${relatedIndex}/table/collection`,
        ),
      );
    }
    requireTableContract(related.table, relatedCollection, routeIndex, componentIndex, diagnostics);
  });

  const tabIds = new Set<string>();
  detail.tabs?.forEach((tab, tabIndex) => {
    if (tabIds.has(tab.id)) {
      diagnostics.push(
        error(
          "duplicate_detail_tab",
          `duplicate detail tab ${tab.id}`,
          `/routes/${routeIndex}/components/${componentIndex}/detail/tabs/${tabIndex}/id`,
        ),
      );
    }
    tabIds.add(tab.id);
    tab.sections?.forEach((sectionId, sectionIndex) => {
      if (!sectionIds.has(sectionId)) {
        diagnostics.push(
          error(
            "unknown_detail_tab_section",
            `tab section ${sectionId} is not declared`,
            `/routes/${routeIndex}/components/${componentIndex}/detail/tabs/${tabIndex}/sections/${sectionIndex}`,
          ),
        );
      }
    });
    tab.related?.forEach((relatedId, relatedIndex) => {
      if (!relatedIds.has(relatedId)) {
        diagnostics.push(
          error(
            "unknown_detail_tab_related",
            `tab related panel ${relatedId} is not declared`,
            `/routes/${routeIndex}/components/${componentIndex}/detail/tabs/${tabIndex}/related/${relatedIndex}`,
          ),
        );
      }
    });
  });

  if (detail.timeline !== undefined) {
    requireDetailField(
      detail.timeline.title_field,
      "unknown_timeline_title_field",
      "timeline/title_field",
      fields,
      routeIndex,
      componentIndex,
      diagnostics,
    );
    requireDetailField(
      detail.timeline.time_field,
      "unknown_timeline_time_field",
      "timeline/time_field",
      fields,
      routeIndex,
      componentIndex,
      diagnostics,
    );
    if (detail.timeline.description_field !== undefined) {
      requireDetailField(
        detail.timeline.description_field,
        "unknown_timeline_description_field",
        "timeline/description_field",
        fields,
        routeIndex,
        componentIndex,
        diagnostics,
      );
    }
  }
}

function requireDetailField(
  field: string,
  code: string,
  pathSegment: string,
  fields: Set<string>,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  if (!fields.has(field)) {
    diagnostics.push(
      error(
        code,
        `detail field ${field} is not in collection`,
        `/routes/${routeIndex}/components/${componentIndex}/detail/${pathSegment}`,
      ),
    );
  }
}

function requireTableProps(
  component: ComponentSpec,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const table = tableProp(component);
  if (table === undefined) {
    diagnostics.push(
      error("missing_table_props", "table component must include table", `/routes/${routeIndex}/components/${componentIndex}/table`),
    );
    return;
  }
  if (typeof table.collection !== "string") {
    diagnostics.push(
      error(
        "missing_table_collection",
        "table component must declare table.collection",
        `/routes/${routeIndex}/components/${componentIndex}/table/collection`,
      ),
    );
  }
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    diagnostics.push(
      error(
        "missing_table_columns",
        "table component must declare at least one column",
        `/routes/${routeIndex}/components/${componentIndex}/table/columns`,
      ),
    );
  }
}

function requireTableContract(
  table: TableSpec,
  collection: ResourceCollectionSpec,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const fields = fieldSet(collection);
  const sortableFields = new Set(collection.pagination.order_by.map((sort) => sort.field));
  const actions = new Map(collection.actions.map((action) => [action.name, action]));
  const columnIds = new Set<string>();

  if (!Array.isArray(table.columns)) return;

  if (table.bulk_actions !== undefined && table.bulk_actions.length > 0) {
    if (table.selection?.mode !== "multiple" || table.selection.required_for_bulk_actions !== true) {
      diagnostics.push(
        error(
          "invalid_bulk_selection",
          "tables with bulk actions must declare multiple selection required for bulk actions",
          `/routes/${routeIndex}/components/${componentIndex}/table/selection`,
        ),
      );
    }
  }

  table.columns.forEach((column, columnIndex) => {
    if (columnIds.has(column.id)) {
      diagnostics.push(
        error(
          "duplicate_table_column",
          `duplicate table column ${column.id}`,
          `/routes/${routeIndex}/components/${componentIndex}/table/columns/${columnIndex}/id`,
        ),
      );
    }
    columnIds.add(column.id);

    if (!fields.has(column.field)) {
      diagnostics.push(
        error(
          "unknown_table_column_field",
          `table column field ${column.field} is not in collection ${collection.name}`,
          `/routes/${routeIndex}/components/${componentIndex}/table/columns/${columnIndex}/field`,
        ),
      );
    }

    if (column.sortable === true && !sortableFields.has(column.field)) {
      diagnostics.push(
        error(
          "unsortable_table_column",
          `table column ${column.id} marks ${column.field} sortable but collection pagination does not order by it`,
          `/routes/${routeIndex}/components/${componentIndex}/table/columns/${columnIndex}/sortable`,
        ),
      );
    }
  });

  table.row_actions?.forEach((actionName, actionIndex) => {
    if (!actions.has(actionName)) {
      diagnostics.push(
        error(
          "unknown_table_row_action",
          `row action ${actionName} is not declared on collection ${collection.name}`,
          `/routes/${routeIndex}/components/${componentIndex}/table/row_actions/${actionIndex}`,
        ),
      );
    }
  });

  table.bulk_actions?.forEach((actionName, actionIndex) => {
    const action = actions.get(actionName);
    if (action === undefined) {
      diagnostics.push(
        error(
          "unknown_table_bulk_action",
          `bulk action ${actionName} is not declared on collection ${collection.name}`,
          `/routes/${routeIndex}/components/${componentIndex}/table/bulk_actions/${actionIndex}`,
        ),
      );
      return;
    }
    if (action.method === "get" || action.method === "create") {
      diagnostics.push(
        error(
          "invalid_table_bulk_action",
          `bulk action ${actionName} must be update, delete, or custom`,
          `/routes/${routeIndex}/components/${componentIndex}/table/bulk_actions/${actionIndex}`,
        ),
      );
    }
  });
}

function requireChartProps(
  component: ComponentSpec,
  routeIndex: number,
  componentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const chart = chartProp(component);
  if (!chart || typeof chart !== "object") {
    diagnostics.push(
      error("missing_chart_props", "chart component must include chart", `/routes/${routeIndex}/components/${componentIndex}/chart`),
    );
    return;
  }
  if (typeof chart.kind !== "string" || !chartKinds.has(chart.kind as ChartKind)) {
    diagnostics.push(
      error(
        "unsupported_chart_kind",
        `chart kind ${String(chart.kind)} is not supported`,
        `/routes/${routeIndex}/components/${componentIndex}/chart/kind`,
      ),
    );
  }
  if (!chart.encoding || typeof chart.encoding !== "object" || Object.keys(chart.encoding).length === 0) {
    diagnostics.push(
      error(
        "missing_chart_encoding",
        "chart component must include a non-empty encoding",
        `/routes/${routeIndex}/components/${componentIndex}/chart/encoding`,
      ),
    );
  }
}

function fieldSet(collection: ResourceCollectionSpec): Set<string> {
  return new Set(collection.fields.map((field) => field.name));
}

function rootPath(path: string): string {
  return path.split(/[.[\]]/, 1)[0] ?? path;
}

function collectionProp(component: ComponentSpec): string | undefined {
  const detail = detailProp(component);
  if (detail !== undefined) return detail.collection;

  const table = tableProp(component);
  if (table !== undefined) return table.collection;

  const value = (component as { collection?: unknown }).collection;
  return typeof value === "string" ? value : undefined;
}

function chartKindProp(component: ComponentSpec): string | undefined {
  const chart = chartProp(component);
  return chart && typeof chart === "object" && typeof chart.kind === "string" ? chart.kind : undefined;
}

function tableProp(component: ComponentSpec): TableSpec | undefined {
  const table = (component as { table?: unknown }).table;
  if (!table || typeof table !== "object") return undefined;
  return table as TableSpec;
}

function detailProp(component: ComponentSpec): DetailSpec | undefined {
  const detail = (component as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return undefined;
  return detail as DetailSpec;
}

function chartProp(component: ComponentSpec): { kind?: unknown; encoding?: unknown } | undefined {
  const chart = (component as { chart?: unknown }).chart;
  if (!chart || typeof chart !== "object") return undefined;
  return chart as { kind?: unknown; encoding?: unknown };
}

function error(code: string, message: string, path: string): Diagnostic {
  return { severity: "error", code, message, path };
}
