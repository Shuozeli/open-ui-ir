import type { CompileContext, CompileOutput, CompilerTarget, TargetManifest } from "@open-ui-ir/compiler-core";
import type {
  ActionSpec,
  AuthRequirement,
  ChartKind,
  ComponentSpec,
  DetailSpec,
  ResourceCollectionSpec,
  TableSpec,
  UiRouteSpec,
} from "@open-ui-ir/protocol";

export const reactAntdManifest: TargetManifest = {
  name: "react-antd",
  layouts: ["crud_list", "detail_page", "dashboard"],
  component_kinds: ["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid"],
  field_renderers: ["text", "badge", "datetime", "number", "external_link", "json"],
  filter_kinds: ["text", "select", "multi_select", "date_range", "boolean"],
  action_methods: ["get", "create", "update", "delete", "custom"],
  chart_kinds: [
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
  ],
  transports: ["graphql", "rest"],
};

export const reactAntdTarget: CompilerTarget = {
  name: "react-antd",
  manifest: reactAntdManifest,
  compile(context: CompileContext): CompileOutput {
    return {
      target: "react-antd",
      diagnostics: [],
      files: context.document.routes.map((route) => ({
        path: routeToFile(route.route, ".tsx"),
        content: compileRoute(route, context.document.collections),
      })),
    };
  },
};

function compileRoute(route: UiRouteSpec, collections: ResourceCollectionSpec[]): string {
  const hasChart = route.components.some((component) => component.kind === "chart");
  const routeRequirement = route.auth?.requirement;
  const deniedMessage = route.auth?.denied_message ?? "You do not have access to this page.";
  return `${hasChart ? 'import { Column, Funnel, Gauge, Heatmap, Line, Liquid, Pie, Radar, RadialBar, Rose, Scatter, Treemap, WordCloud } from "@ant-design/charts";\n' : ""}import { Card, Table, Typography } from "antd";

type OpenUiAuthRequirement =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; permission: string }
  | { kind: "role"; role: string }
  | { kind: "all"; requirements: OpenUiAuthRequirement[] }
  | { kind: "any"; requirements: OpenUiAuthRequirement[] };

interface OpenUiAuthContext {
  subject: string;
  authenticated: boolean;
  permissions: string[];
  roles?: string[];
}

const anonymousAuthContext: OpenUiAuthContext = {
  subject: "anonymous",
  authenticated: false,
  permissions: [],
};

function can(requirement: OpenUiAuthRequirement | undefined, context: OpenUiAuthContext): boolean {
  if (requirement === undefined) return true;
  if (requirement.kind === "public") return true;
  if (requirement.kind === "authenticated") return context.authenticated;
  if (requirement.kind === "permission") return context.permissions.includes(requirement.permission);
  if (requirement.kind === "role") return context.roles?.includes(requirement.role) ?? false;
  if (requirement.kind === "all") return requirement.requirements.every((child) => can(child, context));
  return requirement.requirements.some((child) => can(child, context));
}

export function GeneratedPage({ rows = [], loading = false, authContext = anonymousAuthContext }: { rows?: Array<Record<string, unknown>>; loading?: boolean; authContext?: OpenUiAuthContext }) {
  if (!can(${JSON.stringify(routeRequirement)}, authContext)) {
    return (
      <div style={{ padding: 24 }}>
        <Typography.Title level={3}>Access denied</Typography.Title>
        <Typography.Paragraph type="secondary">${escapeText(deniedMessage)}</Typography.Paragraph>
        ${route.auth?.fallback !== undefined ? `<Typography.Link href="${escapeAttribute(route.auth.fallback)}">Continue</Typography.Link>` : ""}
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>${escapeText(route.title)}</Typography.Title>
      ${route.components.map((component) => compileComponent(component, collections)).join("\n      ")}
    </div>
  );
}
`;
}

function compileComponent(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
  if (component.kind === "chart") {
    return compileChart(component);
  }
  if (component.kind === "table") {
    return compileTable(component, collections);
  }
  if (component.kind === "detail_header") {
    return compileDetailHeader(component, collections);
  }
  return `<Card size="small">
        <Table rowKey="name" dataSource={rows} loading={loading} pagination={false} />
      </Card>`;
}

function compileDetailHeader(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
  const detail = readDetail(component);
  const sectionTitles = detail.sections?.map((section) => section.label).join(", ") ?? "";
  return `<Card size="small" title="${escapeAttribute(detail.title_field)}">
        <Typography.Text type="secondary">${escapeText(detail.subtitle_field ?? detail.collection)}</Typography.Text>
        ${detail.status_field !== undefined ? `<Typography.Paragraph>Status: ${escapeText(detail.status_field)}</Typography.Paragraph>` : ""}
        ${sectionTitles ? `<Typography.Paragraph>Sections: ${escapeText(sectionTitles)}</Typography.Paragraph>` : ""}
        ${compileActionBar(detail.actions ?? [], detail.collection, collections, "detail")}
      </Card>`;
}

function compileTable(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
  const table = readTable(component);
  const fieldAuth = fieldAuthMap(collections, table.collection);
  const columns = table.columns
    .filter((column) => column.visible !== false)
    .map((column) => ({
      ...(fieldAuth.get(column.field) !== undefined ? { auth: fieldAuth.get(column.field) } : {}),
      column: {
        title: column.label ?? column.field,
        dataIndex: column.field,
        key: column.id,
        ...(column.width !== undefined ? { width: column.width } : {}),
        ...(column.align !== undefined ? { align: antTableAlign(column.align) } : {}),
        ...(column.sortable === true ? { sorter: true } : {}),
      },
    }));
  return `<Card size="small">
        <div className="open-ui-table-desktop">
          <Table rowKey="name" columns={${JSON.stringify(columns)}.filter((entry) => can(entry.auth, authContext)).map((entry) => entry.column)} dataSource={rows} loading={loading} pagination={false} />
        </div>
        ${compileActionBar([...(table.row_actions ?? []), ...(table.bulk_actions ?? [])], table.collection, collections, "table")}
        ${compileMobileCards(table, fieldAuth)}
      </Card>`;
}

function compileMobileCards(table: TableSpec, fieldAuth: Map<string, AuthRequirement>): string {
  const mobile = table.mobile;
  if (mobile === undefined || mobile.presentation !== "cards") return "";
  const metadataFields = (mobile.metadata_fields ?? []).map((field) => ({
    field,
    label: field,
    ...(fieldAuth.get(field) !== undefined ? { auth: fieldAuth.get(field) } : {}),
  }));
  const primaryAuth = fieldAuth.get(mobile.primary_field);
  const secondaryAuth = mobile.secondary_field === undefined ? undefined : fieldAuth.get(mobile.secondary_field);
  return `<div className="open-ui-mobile-cards">
          {loading ? (
            <Typography.Text type="secondary">Loading...</Typography.Text>
          ) : rows.map((row, index) => (
            <Card key={String(row.name ?? index)} size="small" style={{ marginBottom: 12 }}>
              {can(${JSON.stringify(primaryAuth)}, authContext) ? <Typography.Text strong>{String(row[${JSON.stringify(mobile.primary_field)}] ?? "")}</Typography.Text> : null}
              ${mobile.secondary_field !== undefined ? `{can(${JSON.stringify(secondaryAuth)}, authContext) ? <Typography.Paragraph type="secondary">{String(row[${JSON.stringify(mobile.secondary_field)}] ?? "")}</Typography.Paragraph> : null}` : ""}
              {${JSON.stringify(metadataFields)}.filter((field) => can(field.auth, authContext)).map((field) => (
                <Typography.Paragraph key={field.field} style={{ marginBottom: 4 }}>{field.label}: {String(row[field.field] ?? "")}</Typography.Paragraph>
              ))}
            </Card>
          ))}
        </div>
        <style>{\`.open-ui-mobile-cards { display: none; } @media (max-width: 768px) { .open-ui-table-desktop { display: none; } .open-ui-mobile-cards { display: block; } }\`}</style>`;
}

function fieldAuthMap(collections: ResourceCollectionSpec[], collectionName: string): Map<string, AuthRequirement> {
  return new Map(
    (collections.find((collection) => collection.name === collectionName)?.fields ?? [])
      .flatMap((field) => field.auth?.read === undefined ? [] : [[field.name, field.auth.read] as const]),
  );
}

function compileActionBar(
  actionNames: string[],
  collectionName: string,
  collections: ResourceCollectionSpec[],
  surface: string,
): string {
  const actionSpecs = actionSpecMap(collections, collectionName);
  const actions = actionNames.filter((name, index, names) => names.indexOf(name) === index).map((name) => {
    const action = actionSpecs.get(name);
    return {
      name,
      label: action?.label ?? name,
      ...(action?.auth?.invoke !== undefined ? { auth: action.auth.invoke } : {}),
      unauthorized: action?.auth?.unauthorized ?? "hide",
    };
  });
  if (actions.length === 0) return "";
  return `<div aria-label="${escapeAttribute(surface)} actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {${JSON.stringify(actions)}.filter((action) => can(action.auth, authContext) || action.unauthorized === "disable").map((action) => (
            <button key={action.name} type="button" disabled={!can(action.auth, authContext)}>{action.label}</button>
          ))}
        </div>`;
}

function actionSpecMap(collections: ResourceCollectionSpec[], collectionName: string): Map<string, ActionSpec> {
  return new Map(
    (collections.find((collection) => collection.name === collectionName)?.actions ?? []).map((action) => [action.name, action]),
  );
}

function compileChart(component: ComponentSpec): string {
  const chart = readChart(component);
  const chartComponent = antvComponent(chart.kind);
  const config = {
    data: [],
    ...(chart.encoding.x !== undefined ? { xField: chart.encoding.x } : {}),
    ...(chart.encoding.y !== undefined ? { yField: chart.encoding.y } : {}),
    ...(chart.encoding.value !== undefined ? { angleField: chart.encoding.value } : {}),
    ...(chart.encoding.category !== undefined ? { colorField: chart.encoding.category } : {}),
    ...(chart.encoding.color !== undefined ? { colorField: chart.encoding.color } : {}),
    ...(chart.height !== undefined ? { height: chart.height } : {}),
    ...(chart.stack !== undefined ? { stack: chart.stack } : {}),
    ...(chart.smooth !== undefined ? { smooth: chart.smooth } : {}),
  };
  return `<Card size="small"${chart.title !== undefined ? ` title="${escapeAttribute(chart.title)}"` : ""}>
        <${chartComponent} {...${JSON.stringify(config)}} />
      </Card>`;
}

function readChart(component: ComponentSpec): {
  kind: ChartKind;
  title?: string;
  encoding: { x?: string; y?: string; value?: string; category?: string; color?: string };
  height?: number;
  stack?: boolean;
  smooth?: boolean;
} {
  const chart = (component as { chart?: unknown }).chart;
  if (!chart || typeof chart !== "object") {
    throw new Error(`chart component ${component.id} is missing chart`);
  }
  return chart as ReturnType<typeof readChart>;
}

function readTable(component: ComponentSpec): TableSpec {
  const table = (component as { table?: unknown }).table;
  if (!table || typeof table !== "object") {
    throw new Error(`table component ${component.id} is missing table`);
  }
  return table as TableSpec;
}

function readDetail(component: ComponentSpec): DetailSpec {
  const detail = (component as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") {
    throw new Error(`detail component ${component.id} is missing detail`);
  }
  return detail as DetailSpec;
}

function antTableAlign(align: "start" | "center" | "end"): "left" | "center" | "right" {
  if (align === "start") return "left";
  if (align === "end") return "right";
  return "center";
}

function antvComponent(kind: ChartKind): string {
  switch (kind) {
    case "line":
    case "area":
      return "Line";
    case "bar":
      return "Column";
    case "pie":
      return "Pie";
    case "heatmap":
      return "Heatmap";
    case "scatter":
      return "Scatter";
    case "radar":
      return "Radar";
    case "rose":
      return "Rose";
    case "radial_bar":
      return "RadialBar";
    case "funnel":
      return "Funnel";
    case "treemap":
      return "Treemap";
    case "word_cloud":
      return "WordCloud";
    case "gauge":
      return "Gauge";
    case "liquid":
      return "Liquid";
  }
}

function routeToFile(route: string, suffix: string): string {
  const slug = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `react-antd/${slug || "index"}${suffix}`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
