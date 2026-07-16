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
  VideoSpec,
} from "@open-ui-ir/protocol";

export const reactMantineManifest: TargetManifest = {
  name: "react-mantine",
  layouts: ["crud_list", "detail_page", "dashboard"],
  component_kinds: ["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid", "video"],
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
        content: compileRoute(route, context.document.collections),
      })),
    };
  },
};

function compileRoute(route: UiRouteSpec, collections: ResourceCollectionSpec[]): string {
  const hasMantineChart = route.components.some(
    (component) => component.kind === "chart" && mantineChartComponent(readChart(component).kind) !== undefined,
  );
  const routeRequirement = combineRequirements([
    route.auth?.requirement,
    ...collectionRequirementsForRoute(route, collections),
  ]);
  const deniedMessage = route.auth?.denied_message ?? "You do not have access to this page.";
  return `${hasMantineChart ? 'import { AreaChart, BarChart, LineChart, PieChart, RadarChart, ScatterChart } from "@mantine/charts";\n' : ""}import { Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

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

function shouldRenderAuthSurface(requirement: OpenUiAuthRequirement | undefined, unauthorized: string | undefined, context: OpenUiAuthContext): boolean {
  return can(requirement, context) || unauthorized === "redact" || unauthorized === "disable";
}

function authText(value: unknown, requirement: OpenUiAuthRequirement | undefined, unauthorized: string | undefined, context: OpenUiAuthContext): string {
  if (can(requirement, context)) return String(value ?? "");
  if (unauthorized === "redact") return "Redacted";
  return "";
}

export const openUiAuthRequirement: OpenUiAuthRequirement | undefined = ${JSON.stringify(routeRequirement)};

export function GeneratedPage({ rows = [], loading = false, authContext = anonymousAuthContext }: { rows?: Array<Record<string, unknown>>; loading?: boolean; authContext?: OpenUiAuthContext }) {
  if (!can(openUiAuthRequirement, authContext)) {
    return (
      <Stack p="lg" gap="sm">
        <Title order={3}>Access denied</Title>
        <Text c="dimmed">{${JSON.stringify(deniedMessage)}}</Text>
        ${route.auth?.fallback !== undefined ? `<Text component="a" href={${JSON.stringify(route.auth.fallback)}}>Continue</Text>` : ""}
      </Stack>
    );
  }

  return (
    <Stack p="lg" gap="md">
      <Title order={3}>${escapeText(route.title)}</Title>
      ${route.components.map((component) => compileComponent(component, collections)).join("\n      ")}
    </Stack>
  );
}
`;
}

function compileComponent(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
  if (component.kind === "chart") {
    return compileChart(component);
  }
  if (component.kind === "video") {
    return compileVideo(component);
  }
  if (component.kind === "metric_row") {
    return compileMetricRow(component);
  }
  if (component.kind === "table") {
    return compileTable(component, collections);
  }
  if (component.kind === "detail_header") {
    return compileDetailHeader(component, collections);
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

function compileTable(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
  const table = readTable(component);
  const fieldAuth = fieldAuthMap(collections, table.collection);
  const columns = table.columns.filter((column) => column.visible !== false);
  const columnSpecs = columns.map((column) => ({
    id: column.id,
    field: column.field,
    label: column.label ?? column.field,
    ...fieldAuth.get(column.field),
  }));
  return `<Card withBorder>
        <div className="open-ui-table-desktop">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {${JSON.stringify(columnSpecs)}.filter((column) => shouldRenderAuthSurface(column.auth, column.unauthorized, authContext)).map((column) => <Table.Th key={column.id}>{column.label}</Table.Th>)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr><Table.Td colSpan={Math.max(${JSON.stringify(columnSpecs)}.filter((column) => shouldRenderAuthSurface(column.auth, column.unauthorized, authContext)).length, 1)}>Loading...</Table.Td></Table.Tr>
              ) : rows.map((row, index) => (
                <Table.Tr key={String(row.name ?? index)}>
                  {${JSON.stringify(columnSpecs)}.filter((column) => shouldRenderAuthSurface(column.auth, column.unauthorized, authContext)).map((column) => <Table.Td key={column.id}>{authText(row[column.field], column.auth, column.unauthorized, authContext)}</Table.Td>)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        ${compileActionBar([...(table.row_actions ?? []), ...(table.bulk_actions ?? [])], table.collection, collections, "table")}
        ${compileMobileCards(table, fieldAuth)}
      </Card>`;
}

function compileMobileCards(table: TableSpec, fieldAuth: Map<string, FieldReadAuth>): string {
  const mobile = table.mobile;
  if (mobile === undefined || mobile.presentation !== "cards") return "";
  const metadataFields = (mobile.metadata_fields ?? []).map((field) => ({
    field,
    label: field,
    ...fieldAuth.get(field),
  }));
  const primaryAuth = fieldAuth.get(mobile.primary_field) ?? {};
  const secondaryAuth = mobile.secondary_field === undefined ? {} : fieldAuth.get(mobile.secondary_field) ?? {};
  return `<Stack className="open-ui-mobile-cards" gap="sm">
          {loading ? (
            <Text size="sm" c="dimmed">Loading...</Text>
          ) : rows.map((row, index) => (
            <Card key={String(row.name ?? index)} withBorder>
              {shouldRenderAuthSurface(${JSON.stringify(primaryAuth.auth)}, ${JSON.stringify(primaryAuth.unauthorized)}, authContext) ? <Text fw={600}>{authText(row[${JSON.stringify(mobile.primary_field)}], ${JSON.stringify(primaryAuth.auth)}, ${JSON.stringify(primaryAuth.unauthorized)}, authContext)}</Text> : null}
              ${mobile.secondary_field !== undefined ? `{shouldRenderAuthSurface(${JSON.stringify(secondaryAuth.auth)}, ${JSON.stringify(secondaryAuth.unauthorized)}, authContext) ? <Text size="sm" c="dimmed">{authText(row[${JSON.stringify(mobile.secondary_field)}], ${JSON.stringify(secondaryAuth.auth)}, ${JSON.stringify(secondaryAuth.unauthorized)}, authContext)}</Text> : null}` : ""}
              {${JSON.stringify(metadataFields)}.filter((field) => shouldRenderAuthSurface(field.auth, field.unauthorized, authContext)).map((field) => (
                <Text key={field.field} size="sm">{field.label}: {authText(row[field.field], field.auth, field.unauthorized, authContext)}</Text>
              ))}
            </Card>
          ))}
        </Stack>
        <style>{\`.open-ui-mobile-cards { display: none; } @media (max-width: 768px) { .open-ui-table-desktop { display: none; } .open-ui-mobile-cards { display: grid; } }\`}</style>`;
}

interface FieldReadAuth {
  auth?: AuthRequirement;
  unauthorized?: "hide" | "redact";
}

function fieldAuthMap(collections: ResourceCollectionSpec[], collectionName: string): Map<string, FieldReadAuth> {
  return new Map(
    (collections.find((collection) => collection.name === collectionName)?.fields ?? [])
      .flatMap((field) => field.auth?.read === undefined ? [] : [[field.name, { auth: field.auth.read, unauthorized: field.auth.unauthorized ?? "hide" }] as const]),
  );
}

function collectionRequirementsForRoute(route: UiRouteSpec, collections: ResourceCollectionSpec[]): AuthRequirement[] {
  const collectionsByName = new Map(collections.map((collection) => [collection.name, collection]));
  return Array.from(new Set(route.components.flatMap((component) => componentCollectionNames(component))))
    .flatMap((collectionName) => {
      const requirement = collectionsByName.get(collectionName)?.auth?.read;
      return requirement === undefined ? [] : [requirement];
    });
}

function componentCollectionNames(component: ComponentSpec): string[] {
  if (component.kind === "filter_bar") return [readStringProp(component, "collection")].filter(Boolean);
  if (component.kind === "table") return [readTable(component).collection];
  if (component.kind === "detail_header") return [readDetail(component).collection];
  return [];
}

function combineRequirements(requirements: Array<AuthRequirement | undefined>): AuthRequirement | undefined {
  const present = requirements.filter((requirement): requirement is AuthRequirement => requirement !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return { kind: "all", requirements: present };
}

function compileDetailHeader(component: ComponentSpec, collections: ResourceCollectionSpec[]): string {
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
        ${compileActionBar(detail.actions ?? [], detail.collection, collections, "detail")}
      </Card>`;
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
  return `<Group aria-label="${escapeAttribute(surface)} actions" gap="xs" mt="sm">
          {${JSON.stringify(actions)}.filter((action) => can(action.auth, authContext) || action.unauthorized === "disable").map((action) => (
            <button key={action.name} type="button" disabled={!can(action.auth, authContext)}>{action.label}</button>
          ))}
        </Group>`;
}

function actionSpecMap(collections: ResourceCollectionSpec[], collectionName: string): Map<string, ActionSpec> {
  return new Map(
    (collections.find((collection) => collection.name === collectionName)?.actions ?? []).map((action) => [action.name, action]),
  );
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

function compileVideo(component: ComponentSpec): string {
  const video = readVideo(component);
  const sources = video.sources ?? [];
  const style = {
    width: "100%",
    aspectRatio: video.aspect_ratio ?? "16/9",
    objectFit: video.fit ?? "contain",
    background: "#000",
  };
  return `<Card withBorder>
        ${video.title !== undefined ? `<Text fw={600} mb="sm">{${JSON.stringify(video.title)}}</Text>` : ""}
        <video
          src={${JSON.stringify(video.src)}}
          poster={${JSON.stringify(video.poster)}}
          controls={${JSON.stringify(video.controls ?? true)}}
          autoPlay={${JSON.stringify(video.autoplay ?? false)}}
          muted={${JSON.stringify(video.muted ?? false)}}
          loop={${JSON.stringify(video.loop ?? false)}}
          playsInline={${JSON.stringify(video.plays_inline ?? true)}}
          style={${JSON.stringify(style)}}
        >
          ${sources.map((source) => `<source src={${JSON.stringify(source.src)}}${source.type !== undefined ? ` type={${JSON.stringify(source.type)}}` : ""} />`).join("\n          ")}
        </video>
        ${video.caption !== undefined ? `<Text size="sm" c="dimmed" mt="xs">{${JSON.stringify(video.caption)}}</Text>` : ""}
      </Card>`;
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

function readVideo(component: ComponentSpec): VideoSpec {
  const video = (component as { video?: unknown }).video;
  if (!video || typeof video !== "object") {
    throw new Error(`video component ${component.id} is missing video`);
  }
  return video as VideoSpec;
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

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
