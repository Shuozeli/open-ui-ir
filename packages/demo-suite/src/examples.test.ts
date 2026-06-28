import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { angularTarget } from "@open-ui-ir/angular";
import { reactAntdTarget } from "@open-ui-ir/react-antd";
import { reactMantineTarget } from "@open-ui-ir/react-mantine";
import { tuiTarget } from "@open-ui-ir/tui";
import type { ChartKind, OpenUiDocument } from "@open-ui-ir/protocol";
import { compileDocument, validateDocument } from "@open-ui-ir/compiler-core";

const examplesDir = new URL("../../../examples", import.meta.url);

describe("examples", () => {
  for (const file of readdirSync(examplesDir).filter((name) => name.endsWith(".ui.json"))) {
    it(`${file} validates and compiles to all current targets`, () => {
      const source = readFileSync(join(examplesDir.pathname, file), "utf8");
      expect(source).not.toContain("\"result_path\"");
      expect(source).not.toContain("\"data_ref\"");
      expect(source).not.toContain("\"props\"");

      const document = JSON.parse(source) as OpenUiDocument;
      expect(validateDocument(document)).toEqual([]);

      for (const target of [reactAntdTarget, reactMantineTarget, angularTarget, tuiTarget]) {
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
    expect(
      new Set(
        collections.flatMap((collection) =>
          collection.actions.flatMap((action) => action.form?.fields.map((field) => field.control) ?? []),
        ),
      ),
    ).toEqual(new Set(["text", "select", "checkbox"]));
    expect(
      collections
        .flatMap((collection) => collection.actions)
        .find((action) => action.method === "update")?.form?.update_mask,
    ).toEqual({ variable: "update_mask", value: { kind: "form", path: "update_mask" } });
    expect(
      collections
        .flatMap((collection) => collection.actions)
        .filter((action) => action.method !== "get")
        .every((action) => action.interaction?.outcome !== undefined),
    ).toBe(true);
    expect(
      collections
        .flatMap((collection) => collection.actions)
        .find((action) => action.method === "delete")?.interaction?.confirmation?.destructive,
    ).toBe(true);

    const routes = document.routes;
    expect(new Set(routes.map((route) => route.layout))).toEqual(new Set(["crud_list", "detail_page", "dashboard"]));
    expect(new Set(routes.flatMap((route) => route.components.map((component) => component.kind)))).toEqual(
      new Set(["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid"]),
    );
    const tableSpecs = routes
      .flatMap((route) => route.components)
      .filter((component) => component.kind === "table")
      .map((component) => component.table);
    expect(tableSpecs[0]?.columns.length).toBeGreaterThan(0);
    expect(tableSpecs[0]?.row_actions).toEqual(["open", "update", "acknowledge", "delete"]);
    expect(tableSpecs[0]?.bulk_actions).toEqual(["acknowledge", "delete"]);
    expect(tableSpecs[0]?.selection).toEqual({ mode: "multiple", required_for_bulk_actions: true });
    expect(tableSpecs[0]?.mobile).toEqual({
      presentation: "cards",
      primary_field: "title",
      secondary_field: "service",
      metadata_fields: ["severity", "created_at", "acknowledged"],
      action_display: "menu",
    });

    const detailSpec = routes
      .flatMap((route) => route.components)
      .find((component) => component.kind === "detail_header")?.detail;
    expect(detailSpec?.sections?.length).toBeGreaterThan(0);
    expect(detailSpec?.tabs?.length).toBeGreaterThan(0);
    expect(detailSpec?.related?.length).toBeGreaterThan(0);
    expect(detailSpec?.timeline).toBeDefined();
    expect(detailSpec?.mobile).toEqual({
      sections_presentation: "stack",
      related_presentation: "stack",
      sticky_actions: true,
    });

    const routeTransports = routes.flatMap((route) => route.data_bindings.map((binding) => binding.query.transport));
    const actionTransports = collections.flatMap((collection) => collection.actions.map((action) => action.binding.transport));
    expect(new Set([...routeTransports, ...actionTransports])).toEqual(new Set(["graphql"]));

    const chartKinds = routes
      .flatMap((route) => route.components)
      .filter((component) => component.kind === "chart")
      .map((component) => component.chart.kind satisfies ChartKind);
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

describe("package boundaries", () => {
  it("keeps UI library peers in their renderer packages only", () => {
    // Arrange
    const packageNames = [
      "protocol",
      "compiler-core",
      "react-antd",
      "react-mantine",
      "angular",
      "tui",
      "cli",
      "demo-suite",
    ];

    // Act
    const packages = new Map(packageNames.map((name) => [name, readPackageJson(name)]));

    // Assert
    for (const name of ["protocol", "compiler-core", "angular", "tui", "cli", "demo-suite"]) {
      expect(dependencyNames(packages.get(name)!).filter(isUiLibraryPackage)).toEqual([]);
    }
    expect(dependencyNames(packages.get("react-antd")!).filter(isMantinePackage)).toEqual([]);
    expect(dependencyNames(packages.get("react-mantine")!).filter(isAntdPackage)).toEqual([]);

    expect(Object.keys(packages.get("react-antd")!.peerDependencies ?? {})).toEqual(
      expect.arrayContaining(["antd", "@ant-design/charts", "react"]),
    );
    expect(Object.keys(packages.get("react-mantine")!.peerDependencies ?? {})).toEqual(
      expect.arrayContaining(["@mantine/core", "@mantine/charts", "react", "react-dom"]),
    );
  });
});

function readExample(file: string): OpenUiDocument {
  return JSON.parse(readFileSync(join(examplesDir.pathname, file), "utf8")) as OpenUiDocument;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readPackageJson(packageName: string): PackageJson {
  return JSON.parse(readFileSync(join(examplesDir.pathname, "../packages", packageName, "package.json"), "utf8")) as PackageJson;
}

function dependencyNames(packageJson: PackageJson): string[] {
  return Object.keys({
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
  });
}

function isAntdPackage(name: string): boolean {
  return name === "antd" || name.startsWith("@ant-design/");
}

function isMantinePackage(name: string): boolean {
  return name.startsWith("@mantine/");
}

function isUiLibraryPackage(name: string): boolean {
  return isAntdPackage(name) || isMantinePackage(name);
}
