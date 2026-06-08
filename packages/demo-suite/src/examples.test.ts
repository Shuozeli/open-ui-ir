import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { angularTarget } from "@open-ui-ir/angular";
import { reactAntdTarget } from "@open-ui-ir/react-antd";
import { tuiTarget } from "@open-ui-ir/tui";
import type { ChartKind, OpenUiDocument } from "@open-ui-ir/protocol";
import { compileDocument, validateDocument } from "@open-ui-ir/compiler-core";

const examplesDir = new URL("../../../examples", import.meta.url);

describe("examples", () => {
  for (const file of readdirSync(examplesDir).filter((name) => name.endsWith(".ui.json"))) {
    it(`${file} validates and compiles to all current targets`, () => {
      const document = JSON.parse(readFileSync(join(examplesDir.pathname, file), "utf8")) as OpenUiDocument;
      expect(validateDocument(document)).toEqual([]);

      for (const target of [reactAntdTarget, angularTarget, tuiTarget]) {
        const output = compileDocument(document, target);
        expect(output.diagnostics).toEqual([]);
        expect(output.files.length).toBeGreaterThan(0);
      }
    });
  }

  it("all-features.ui.json covers every stable protocol feature", () => {
    const document = readExample("all-features.ui.json");
    expect(validateDocument(document)).toEqual([]);

    expect(new Set(document.capabilities.layouts)).toEqual(new Set(["crud_list", "detail_page", "dashboard"]));
    expect(new Set(document.capabilities.component_kinds)).toEqual(
      new Set(["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid"]),
    );
    expect(new Set(document.capabilities.filter_kinds)).toEqual(
      new Set(["text", "select", "multi_select", "date_range", "boolean"]),
    );
    expect(new Set(document.capabilities.action_methods)).toEqual(
      new Set(["get", "create", "update", "delete", "custom"]),
    );
    expect(document.default_locale).toBe("en-US");
    expect(new Set(document.locales?.map((locale) => locale.locale))).toEqual(new Set(["en-US", "zh-CN"]));
    expect(document.messages?.["zh-CN"]?.["Incident Dashboard"]).toBe("事件看板");

    const collections = document.collections;
    expect(new Set(collections.flatMap((collection) => collection.fields.map((field) => field.value_type)))).toEqual(
      new Set(["string", "number", "boolean", "datetime", "json"]),
    );
    expect(new Set(collections.flatMap((collection) => collection.fields.map((field) => field.renderer)))).toEqual(
      new Set(["text", "badge", "datetime", "number", "external_link", "json"]),
    );
    expect(new Set(collections.flatMap((collection) => collection.filters.map((filter) => filter.kind)))).toEqual(
      new Set(["text", "select", "multi_select", "date_range", "boolean"]),
    );
    expect(new Set(collections.flatMap((collection) => collection.actions.map((action) => action.method)))).toEqual(
      new Set(["get", "create", "update", "delete", "custom"]),
    );

    const routes = document.routes;
    expect(new Set(routes.map((route) => route.layout))).toEqual(new Set(["crud_list", "detail_page", "dashboard"]));
    expect(new Set(routes.flatMap((route) => route.components.map((component) => component.kind)))).toEqual(
      new Set(["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid"]),
    );
    const routeTransports = routes.flatMap((route) => route.data_bindings.map((binding) => binding.query.transport));
    const actionTransports = collections.flatMap((collection) => collection.actions.map((action) => action.binding.transport));
    expect(new Set([...routeTransports, ...actionTransports])).toEqual(new Set(["graphql"]));

    const chartKinds = routes
      .flatMap((route) => route.components)
      .filter((component) => component.kind === "chart")
      .map((component) => (component.props as { chart: { kind: ChartKind } }).chart.kind);
    expect(new Set(chartKinds)).toEqual(
      new Set([
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
      ]),
    );
  });
});

function readExample(file: string): OpenUiDocument {
  return JSON.parse(readFileSync(join(examplesDir.pathname, file), "utf8")) as OpenUiDocument;
}
