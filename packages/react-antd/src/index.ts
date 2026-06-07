import type { CompileContext, CompileOutput, CompilerTarget } from "@open-ui-ir/compiler-core";
import type { ChartKind, ComponentSpec } from "@open-ui-ir/protocol";

export const reactAntdTarget: CompilerTarget = {
  name: "react-antd",
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
  return `${hasChart ? 'import { Column, Heatmap, Line, Pie, Scatter } from "@ant-design/charts";\n' : ""}import { Card, Table, Typography } from "antd";

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
  return `<Card size="small">
        <Table rowKey="name" dataSource={rows} loading={loading} pagination={false} />
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
  const chart = (component.props as { chart?: unknown }).chart;
  if (!chart || typeof chart !== "object") {
    throw new Error(`chart component ${component.id} is missing props.chart`);
  }
  return chart as ReturnType<typeof readChart>;
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
