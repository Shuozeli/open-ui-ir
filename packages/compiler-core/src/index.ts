import type {
  FilterKind,
  LayoutKind,
  OpenUiDocument,
  ResourceCollectionSpec,
  UiRouteSpec,
} from "@open-ui-ir/protocol";
import { PROTOCOL_VERSION } from "@open-ui-ir/protocol";

export type DiagnosticSeverity = "error" | "warning";

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

export interface CompilerTarget {
  name: string;
  compile(context: CompileContext): CompileOutput;
}

export function compileDocument(document: OpenUiDocument, target: CompilerTarget): CompileOutput {
  const diagnostics = validateDocument(document);
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

  const routeSet = new Set<string>();
  document.routes.forEach((route, index) => {
    if (routeSet.has(route.route)) {
      diagnostics.push(error("duplicate_route", `duplicate route ${route.route}`, `/routes/${index}/route`));
    }
    routeSet.add(route.route);
    requireLayout(document, route, index, diagnostics);
    requireComponents(document, route, index, diagnostics);
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
    requireFilterCapabilities(document, collection, index, diagnostics);
    requireKeysetTieBreaker(collection, index, diagnostics);
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

function error(code: string, message: string, path: string): Diagnostic {
  return { severity: "error", code, message, path };
}
