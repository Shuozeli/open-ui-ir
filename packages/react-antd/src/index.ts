import type { CompileContext, CompileOutput, CompilerTarget, TargetManifest } from "@open-ui-ir/compiler-core";
import type { ChartKind, ComponentSpec, DetailSpec, TableSpec } from "@open-ui-ir/protocol";

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
        content: compileRoute(route.title, route.components),
      })),
    };
  },
};

function compileRoute(title: string, components: ComponentSpec[]): string {
  const hasChart = components.some((component) => component.kind === "chart");
  return `${hasChart ? 'import { Column, Funnel, Gauge, Heatmap, Line, Liquid, Pie, Radar, RadialBar, Rose, Scatter, Treemap, WordCloud } from "@ant-design/charts";\n' : ""}import { Card, Table, Typography } from "antd";

export function GeneratedPage({ rows = [], loading = false }: { rows?: unknown[]; loading?: boolean }) {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>${escapeText(title)}</Typography.Title>
      ${components.map(compileComponent).join("\n      ")}
    </div>
  );
}
`;
}

function compileComponent(component: ComponentSpec): string {
  if (component.kind === "chart") {
    return compileChart(component);
  }
  if (component.kind === "table") {
    return compileTable(component);
  }
  if (component.kind === "detail_header") {
    return compileDetailHeader(component);
  }
  return `<Card size="small">
        <Table rowKey="name" dataSource={rows} loading={loading} pagination={false} />
      </Card>`;
}

function compileDetailHeader(component: ComponentSpec): string {
  const detail = readDetail(component);
  const sectionTitles = detail.sections?.map((section) => section.label).join(", ") ?? "";
  const actionLabels = detail.actions?.join(", ") ?? "";
  return `<Card size="small" title="${escapeAttribute(detail.title_field)}">
        <Typography.Text type="secondary">${escapeText(detail.subtitle_field ?? detail.collection)}</Typography.Text>
        ${detail.status_field !== undefined ? `<Typography.Paragraph>Status: ${escapeText(detail.status_field)}</Typography.Paragraph>` : ""}
        ${sectionTitles ? `<Typography.Paragraph>Sections: ${escapeText(sectionTitles)}</Typography.Paragraph>` : ""}
        ${actionLabels ? `<Typography.Paragraph>Actions: ${escapeText(actionLabels)}</Typography.Paragraph>` : ""}
      </Card>`;
}

function compileTable(component: ComponentSpec): string {
  const table = readTable(component);
  const columns = table.columns
    .filter((column) => column.visible !== false)
    .map((column) => ({
      title: column.label ?? column.field,
      dataIndex: column.field,
      key: column.id,
      ...(column.width !== undefined ? { width: column.width } : {}),
      ...(column.align !== undefined ? { align: antTableAlign(column.align) } : {}),
      ...(column.sortable === true ? { sorter: true } : {}),
    }));
  return `<Card size="small">
        <Table rowKey="name" columns={${JSON.stringify(columns)}} dataSource={rows} loading={loading} pagination={false} />
      </Card>`;
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
