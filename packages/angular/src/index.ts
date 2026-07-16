import type { CompileContext, CompileOutput, CompilerTarget, TargetManifest } from "@open-ui-ir/compiler-core";

export const angularManifest: TargetManifest = {
  name: "angular",
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

export const angularTarget: CompilerTarget = {
  name: "angular",
  manifest: angularManifest,
  compile(context: CompileContext): CompileOutput {
    return {
      target: "angular",
      diagnostics: [],
      files: context.document.routes.map((route) => ({
        path: routeToFile(route.route),
        content: compileComponent(route.title),
      })),
    };
  },
};

function compileComponent(title: string): string {
  return `import { Component, Input } from "@angular/core";

@Component({
  selector: "open-ui-generated-page",
  standalone: true,
  template: \`
    <section class="open-ui-page">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <tbody>
          <tr *ngFor="let row of rows">
            <td>{{ row.name }}</td>
          </tr>
        </tbody>
      </table>
      <pre *ngIf="chartCount > 0">{{ chartCount }} chart component(s) require an Angular chart target adapter.</pre>
    </section>
  \`
})
export class GeneratedPageComponent {
  @Input() rows: Array<Record<string, unknown>> = [];
  @Input() chartCount = 0;
}
`;
}

function routeToFile(route: string): string {
  const slug = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `angular/${slug || "index"}.component.ts`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
