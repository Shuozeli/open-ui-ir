import { describe, expect, it } from "vitest";
import type { TargetManifest } from "./index.js";
import { compileDocument, validateDocument, validateTargetCompatibility } from "./index.js";
import { exampleDocument } from "./test-fixture.js";

const compatibleManifest: TargetManifest = {
  name: "test-target",
  layouts: ["crud_list", "detail_page", "dashboard"],
  component_kinds: ["filter_bar", "table", "detail_header", "metric_row", "chart", "chart_grid"],
  field_renderers: ["text", "datetime", "number"],
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

describe("validateDocument", () => {
  it("accepts the example document", () => {
    expect(validateDocument(exampleDocument)).toEqual([]);
  });

  it("requires resource name", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.fields = doc.collections[0]!.fields.filter((field) => field.name !== "name");

    expect(validateDocument(doc).map((d) => d.code)).toContain("missing_resource_name");
  });

  it("validates route component references", () => {
    const doc = structuredClone(exampleDocument);
    doc.routes[0]!.components[1]!.data_ref = "missingRows";
    (doc.routes[0]!.components[1]!.props as { collection?: string }).collection = "missingProducts";

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining(["unknown_data_ref", "unknown_collection_ref"]),
    );
  });

  it("validates collection field references", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.fields[1]!.renderer = "missing_renderer";
    doc.collections[0]!.filters[0]!.cel_field = "missing_field";
    doc.collections[0]!.pagination.order_by[0]!.field = "missing_sort_field";
    doc.collections[0]!.pagination.unique_key_fields = ["missing_unique_field"];

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "unsupported_field_renderer",
        "unknown_filter_field",
        "unknown_pagination_field",
        "unknown_unique_key_field",
        "missing_keyset_tie_breaker",
      ]),
    );
  });

  it("validates action and chart capabilities", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "archive",
        label: "Archive",
        method: "archive" as "custom",
        binding: { transport: "graphql", operation: "archiveProduct", result_path: "archiveProduct", variables: {} },
      },
    ];
    (doc.routes[1]!.components[0]!.props as { chart: { kind: string; encoding: Record<string, string> } }).chart = {
      kind: "unsupported-chart",
      encoding: {},
    };

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining(["unsupported_action_method", "unsupported_chart_kind", "missing_chart_encoding"]),
    );
  });

  it("validates create and update action form contracts", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "create",
        label: "Create",
        method: "create",
        binding: { transport: "graphql", operation: "createProduct", result_path: "createProduct", variables: {} },
        form: {
          fields: [
            { field: "title", control: "number" },
            { field: "title", control: "text" },
            { field: "name", control: "text" },
            { field: "missing", control: "text" },
          ],
        },
      },
      {
        name: "update",
        label: "Update",
        method: "update",
        binding: {
          transport: "graphql",
          operation: "updateProduct",
          result_path: "updateProduct",
          variables: { update_mask: "$form" },
        },
        form: {
          fields: [{ field: "title", control: "text" }],
          update_mask: { variable: "update_mask", value_path: "$form.update_mask" },
        },
      },
    ];

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "duplicate_form_field",
        "incompatible_form_control",
        "output_only_form_field",
        "unknown_form_field",
        "missing_required_create_field",
        "invalid_update_mask_binding",
      ]),
    );
  });

  it("requires forms for create and update actions", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "create",
        label: "Create",
        method: "create",
        binding: { transport: "graphql", operation: "createProduct", result_path: "createProduct", variables: {} },
      },
      {
        name: "update",
        label: "Update",
        method: "update",
        binding: { transport: "graphql", operation: "updateProduct", result_path: "updateProduct", variables: {} },
        form: { fields: [{ field: "title", control: "text" }] },
      },
    ];

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining(["missing_action_form", "missing_update_mask"]),
    );
  });

  it("validates target manifests against document requirements", () => {
    const target = {
      ...compatibleManifest,
      layouts: ["crud_list"],
      component_kinds: ["table"],
      field_renderers: ["text"],
      filter_kinds: ["text"],
      action_methods: [],
      chart_kinds: [],
      transports: ["rest"],
    } satisfies TargetManifest;
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "open",
        label: "Open",
        method: "get",
        binding: { transport: "graphql", operation: "product", result_path: "product", variables: {} },
      },
    ];

    expect(validateTargetCompatibility(doc, target).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "target_unsupported_layout",
        "target_unsupported_transport",
        "target_unsupported_component",
        "target_unsupported_field_renderer",
        "target_unsupported_filter",
        "target_unsupported_action",
        "target_unsupported_chart",
      ]),
    );
  });

  it("adds target manifest diagnostics during compile", () => {
    const output = compileDocument(exampleDocument, {
      name: "limited",
      manifest: { ...compatibleManifest, chart_kinds: [] },
      compile() {
        return { target: "limited", files: [], diagnostics: [] };
      },
    });

    expect(output.diagnostics.map((d) => d.code)).toContain("target_unsupported_chart");
  });
});
