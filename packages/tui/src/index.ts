import type { CompileContext, CompileOutput, CompilerTarget, TargetManifest } from "@open-ui-ir/compiler-core";

export interface TuiScreen {
  title: string;
  route: string;
  sections: Array<{ kind: string; id: string; data?: { binding: string; path?: string }; visualization?: string }>;
}

export const tuiManifest: TargetManifest = {
  name: "tui",
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

export const tuiTarget: CompilerTarget = {
  name: "tui",
  manifest: tuiManifest,
  compile(context: CompileContext): CompileOutput {
    const screens: TuiScreen[] = context.document.routes.map((route) => ({
      title: route.title,
      route: route.route,
      sections: route.components.map((component) => ({
        kind: component.kind,
        id: component.id,
        ...(component.data !== undefined ? { data: component.data } : {}),
        ...(component.kind === "chart" ? { visualization: readChartKind(component) } : {}),
      })),
    }));

    return {
      target: "tui",
      diagnostics: [],
      files: [
        {
          path: "tui/screens.json",
          content: `${JSON.stringify({ app: context.document.app_name, screens }, null, 2)}\n`,
        },
      ],
    };
  },
};

function readChartKind(component: { chart?: unknown }): string {
  const chart = component.chart;
  if (chart && typeof chart === "object" && "kind" in chart) {
    return String((chart as { kind: unknown }).kind);
  }
  return "unknown";
}
