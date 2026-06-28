import type { CompileContext, CompileOutput, CompilerTarget, TargetManifest } from "@open-ui-ir/compiler-core";
import type { ChartKind, ComponentSpec, DetailSpec, TableSpec } from "@open-ui-ir/protocol";

export const reactMantineManifest: TargetManifest = {
  name: "react-mantine",
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

export const reactMantineTarget: CompilerTarget = {
  name: "react-mantine",
  manifest: reactMantineManifest,
  compile(context: CompileContext): CompileOutput {
    return {
      target: "react-mantine",
      diagnostics: [],
      files: context.document.routes.map((route) => ({
        path: routeToFile(route.route),
        content: compileRoute(route.title, route.components),
      })),
    };
  },
};

function compileRoute(title: string, components: ComponentSpec[]): string {
  const hasMantineChart = components.some(
    (component) => component.kind === "chart" && mantineChartComponent(readChart(component).kind) !== undefined,
  );
  return `${hasMantineChart ? 'import { AreaChart, BarChart, LineChart, PieChart, RadarChart, ScatterChart } from "@mantine/charts";\n' : ""}import { Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

export function GeneratedPage({ rows = [], loading = false }: { rows?: Array<Record<string, unknown>>; loading?: boolean }) {
  return (
    <Stack p="lg" gap="md">
      <Title order={3}>${escapeText(title)}</Title>
      ${components.map(compileComponent).join("\n      ")}
    </Stack>
  );
}
`;
}

function compileComponent(component: ComponentSpec): string {
  if (component.kind === "chart") {
    return compileChart(component);
  }
  if (component.kind === "metric_row") {
    return compileMetricRow(component);
  }
  if (component.kind === "table") {
    return compileTable(component);
  }
  if (component.kind === "detail_header") {
    return compileDetailHeader(component);
  }
  if (component.kind === "filter_bar") {
    return `<Card withBorder>
        <Text size="sm" c="dimmed">Filter collection: ${escapeText(readStringProp(component, "collection"))}</Text>
      </Card>`;
  }
  return `<Card withBorder>
        <Text size="sm" c="dimmed">Component ${escapeText(component.id)} (${escapeText(component.kind)})</Text>
      </Card>`;
}

function compileTable(component: ComponentSpec): string {
  const table = readTable(component);
  const columns = table.columns.filter((column) => column.visible !== false);
  return `<Card withBorder>
        <div className="open-ui-table-desktop">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                ${columns.map((column) => `<Table.Th>${escapeText(column.label ?? column.field)}</Table.Th>`).join("\n                ")}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr><Table.Td colSpan={${Math.max(columns.length, 1)}}>Loading...</Table.Td></Table.Tr>
              ) : rows.map((row, index) => (
                <Table.Tr key={String(row.name ?? index)}>
                  ${columns.map((column) => `<Table.Td>{String(row[${JSON.stringify(column.field)}] ?? "")}</Table.Td>`).join("\n                  ")}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        ${compileMobileCards(table)}
      </Card>`;
}

function compileMobileCards(table: TableSpec): string {
  const mobile = table.mobile;
  if (mobile === undefined || mobile.presentation !== "cards") return "";
  const metadataFields = mobile.metadata_fields ?? [];
  return `<Stack className="open-ui-mobile-cards" gap="sm">
          {loading ? (
            <Text size="sm" c="dimmed">Loading...</Text>
          ) : rows.map((row, index) => (
            <Card key={String(row.name ?? index)} withBorder>
              <Text fw={600}>{String(row[${JSON.stringify(mobile.primary_field)}] ?? "")}</Text>
              ${mobile.secondary_field !== undefined ? `<Text size="sm" c="dimmed">{String(row[${JSON.stringify(mobile.secondary_field)}] ?? "")}</Text>` : ""}
              ${metadataFields
                .map(
                  (field) => `<Text size="sm">${escapeText(field)}: {String(row[${JSON.stringify(field)}] ?? "")}</Text>`,
                )
                .join("\n              ")}
            </Card>
          ))}
        </Stack>
        <style>{\`.open-ui-mobile-cards { display: none; } @media (max-width: 768px) { .open-ui-table-desktop { display: none; } .open-ui-mobile-cards { display: grid; } }\`}</style>`;
}

function compileDetailHeader(component: ComponentSpec): string {
  const detail = readDetail(component);
  const sectionLabels = detail.sections?.map((section) => section.label) ?? [];
  return `<Card withBorder>
        <Group justify="space-between" align="start">
          <div>
            <Title order={4}>${escapeText(detail.title_field)}</Title>
            <Text size="sm" c="dimmed">${escapeText(detail.subtitle_field ?? detail.collection)}</Text>
          </div>
          ${detail.status_field !== undefined ? `<Badge variant="light">${escapeText(detail.status_field)}</Badge>` : ""}
        </Group>
        ${sectionLabels.length > 0 ? `<Text mt="sm" size="sm">Sections: ${escapeText(sectionLabels.join(", "))}</Text>` : ""}
      </Card>`;
}

function compileMetricRow(component: ComponentSpec): string {
  const metrics = readMetricSpecs(component);
  return `<SimpleGrid cols={{ base: 1, sm: ${Math.min(Math.max(metrics.length, 1), 4)} }}>
        ${metrics
          .map(
            (metric) => `<Card withBorder>
          <Text size="sm" c="dimmed">${escapeText(metric.label)}</Text>
          <Title order={3}>{String((rows[0] as Record<string, unknown> | undefined)?.[${JSON.stringify(metric.value_path)}] ?? "--")}</Title>
        </Card>`,
          )
          .join("\n        ")}
      </SimpleGrid>`;
}

function compileChart(component: ComponentSpec): string {
  const chart = readChart(component);
  const title = chart.title ?? `${chart.kind} chart`;
  const chartComponent = mantineChartComponent(chart.kind);
  if (chartComponent === undefined) {
    return `<Card withBorder>
        <Text fw={600}>${escapeText(title)}</Text>
        <Text size="sm" c="dimmed">Mantine target received ${escapeText(chart.kind)} chart intent.</Text>
        <Text size="xs" c="dimmed">Encoding: ${escapeText(JSON.stringify(chart.encoding))}</Text>
      </Card>`;
  }
  if (chart.kind === "pie" || chart.kind === "rose") {
    return `<Card withBorder>
        <Text fw={600} mb="sm">${escapeText(title)}</Text>
        <PieChart data={[]} h={${chart.height ?? 260}} />
      </Card>`;
  }
  const seriesName = chart.encoding.y ?? chart.encoding.value ?? "value";
  return `<Card withBorder>
        <Text fw={600} mb="sm">${escapeText(title)}</Text>
        <${chartComponent}
          h={${chart.height ?? 260}}
          data={rows}
          dataKey=${JSON.stringify(chart.encoding.x ?? chart.encoding.category ?? "name")}
          series={[{ name: ${JSON.stringify(seriesName)}, color: "blue.6" }]}
          ${chart.kind === "area" ? "type=\"stacked\"" : ""}
        />
      </Card>`;
}

function readChart(component: ComponentSpec): {
  kind: ChartKind;
  title?: string;
  encoding: { x?: string; y?: string; value?: string; category?: string; color?: string };
  height?: number;
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

function readMetricSpecs(component: ComponentSpec): Array<{ id: string; label: string; value_path: string }> {
  const metrics = (component as { metrics?: unknown }).metrics;
  if (!Array.isArray(metrics)) return [];
  return metrics as Array<{ id: string; label: string; value_path: string }>;
}

function readStringProp(component: ComponentSpec, name: string): string {
  const value = (component as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

function mantineChartComponent(kind: ChartKind): string | undefined {
  switch (kind) {
    case "line":
      return "LineChart";
    case "bar":
      return "BarChart";
    case "area":
      return "AreaChart";
    case "pie":
    case "rose":
      return "PieChart";
    case "radar":
      return "RadarChart";
    case "scatter":
      return "ScatterChart";
    case "heatmap":
    case "radial_bar":
    case "funnel":
    case "treemap":
    case "word_cloud":
    case "gauge":
    case "liquid":
      return undefined;
  }
}

function routeToFile(route: string): string {
  const slug = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `react-mantine/${slug || "index"}.tsx`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
