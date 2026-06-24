import { describe, expect, it } from "vitest";
import type { BindingValue, QueryBinding } from "@open-ui-ir/protocol";
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

function graphqlBinding(
  operation: string,
  resultPath: string,
  variables: Record<string, BindingValue> = {},
): QueryBinding {
  return {
    transport: "graphql",
    operation,
    result: { path: resultPath },
    variables,
  };
}

const updateMaskBinding: BindingValue = { kind: "form", path: "update_mask" };

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
    doc.routes[0]!.components[1]!.data = { binding: "missingRows" };
    (doc.routes[0]!.components[1]! as { table: { collection: string } }).table.collection = "missingProducts";

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining(["unknown_data_ref", "unknown_collection_ref"]),
    );
  });

  it("validates table contracts", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "open",
        label: "Open",
        method: "get",
        binding: graphqlBinding("product", "product"),
      },
      {
        name: "archive",
        label: "Archive",
        method: "custom",
        binding: graphqlBinding("archiveProduct", "archiveProduct"),
      },
    ];
    doc.routes[0]!.components.push({ id: "empty-table", kind: "table" } as never);
    (doc.routes[0]!.components[1]! as {
      table: {
        collection: string;
        columns: Array<{ id: string; field: string; sortable?: boolean }>;
        row_actions: string[];
        bulk_actions: string[];
      };
    }).table = {
      collection: "products",
      columns: [
        { id: "title", field: "title", sortable: true },
        { id: "title", field: "missing" },
      ],
      row_actions: ["missing"],
      bulk_actions: ["missing", "open", "archive"],
    };

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "missing_table_props",
        "duplicate_table_column",
        "unknown_table_column_field",
        "unsortable_table_column",
        "unknown_table_row_action",
        "unknown_table_bulk_action",
        "invalid_table_bulk_action",
      ]),
    );
  });

  it("validates detail contracts", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "open",
        label: "Open",
        method: "get",
        binding: graphqlBinding("product", "product"),
      },
    ];
    doc.routes[0]!.components.push({ id: "empty-detail", kind: "detail_header" } as never);
    doc.routes[0]!.components.push({
      id: "detail",
      kind: "detail_header",
      data: { binding: "rows" },
      detail: {
        collection: "products",
        title_field: "missing_title",
        subtitle_field: "missing_subtitle",
        status_field: "missing_status",
        actions: ["missing_action"],
        sections: [
          { id: "overview", label: "Overview", fields: ["title", "missing_field"] },
          { id: "overview", label: "Duplicate", fields: ["category"] },
        ],
        tabs: [
          { id: "main", label: "Main", sections: ["missing_section"], related: ["missing_related"] },
          { id: "main", label: "Duplicate" },
        ],
        related: [
          {
            id: "siblings",
            label: "Siblings",
            collection: "missing_collection",
            data: { binding: "missingRows" },
            table: { collection: "products", columns: [{ id: "title", field: "title" }] },
          },
          {
            id: "siblings",
            label: "Duplicate",
            collection: "products",
            data: { binding: "rows" },
            table: { collection: "otherProducts", columns: [{ id: "missing", field: "missing_field" }] },
          },
        ],
        timeline: {
          data: { binding: "missingTimeline" },
          title_field: "missing_title",
          time_field: "missing_time",
          description_field: "missing_description",
        },
      },
    } as never);

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "missing_detail_props",
        "unknown_detail_title_field",
        "unknown_detail_subtitle_field",
        "unknown_detail_status_field",
        "unknown_detail_action",
        "duplicate_detail_section",
        "unknown_detail_section_field",
        "duplicate_detail_tab",
        "unknown_detail_tab_section",
        "unknown_detail_tab_related",
        "duplicate_related_resource",
        "unknown_related_collection",
        "unknown_related_data_ref",
        "mismatched_related_table_collection",
        "unknown_table_column_field",
        "unknown_timeline_data_ref",
        "unknown_timeline_title_field",
        "unknown_timeline_time_field",
        "unknown_timeline_description_field",
      ]),
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
        binding: graphqlBinding("archiveProduct", "archiveProduct"),
      },
    ];
    (doc.routes[1]!.components[0]! as unknown as { chart: { kind: string; encoding: Record<string, string> } }).chart = {
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
        binding: graphqlBinding("createProduct", "createProduct"),
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
          ...graphqlBinding("updateProduct", "updateProduct", { update_mask: { kind: "form" } }),
        },
        form: {
          fields: [{ field: "title", control: "text" }],
          update_mask: { variable: "update_mask", value: updateMaskBinding },
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
        binding: graphqlBinding("createProduct", "createProduct"),
      },
      {
        name: "update",
        label: "Update",
        method: "update",
        binding: graphqlBinding("updateProduct", "updateProduct"),
        form: { fields: [{ field: "title", control: "text" }] },
      },
    ];

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining(["missing_action_form", "missing_update_mask"]),
    );
  });

  it("validates action interaction lifecycle contracts", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.actions = [
      {
        name: "open",
        label: "Open",
        method: "get",
        binding: graphqlBinding("product", "product"),
        interaction: { optimistic_update: { mode: "remove_resource" } },
      },
      {
        name: "create",
        label: "Create",
        method: "create",
        binding: graphqlBinding("createProduct", "createProduct"),
        form: {
          fields: [
            { field: "title", control: "text" },
            { field: "category", control: "text" },
          ],
        },
        interaction: {
          outcome: { success_message: "" },
          optimistic_update: { mode: "remove_resource" },
        },
      },
      {
        name: "update",
        label: "Update",
        method: "update",
        binding: {
          ...graphqlBinding("updateProduct", "updateProduct", { update_mask: updateMaskBinding }),
        },
        form: {
          fields: [{ field: "title", control: "text" }],
          update_mask: { variable: "update_mask", value: updateMaskBinding },
        },
        interaction: {
          submit: { presentation: "modal" },
          outcome: { failure_message: "" },
          optimistic_update: { mode: "prepend_resource" },
        },
      },
      {
        name: "delete",
        label: "Delete",
        method: "delete",
        binding: graphqlBinding("deleteProduct", "deleteProduct"),
        interaction: {
          confirmation: { title: "", message: "", destructive: false },
          optimistic_update: { mode: "patch_resource" },
        },
      },
      {
        name: "archive",
        label: "Archive",
        method: "custom",
        binding: graphqlBinding("archiveProduct", "archiveProduct"),
      },
    ];
    (doc.routes[0]!.components[1]! as { table: { bulk_actions: string[] } }).table.bulk_actions = ["delete"];

    expect(validateDocument(doc).map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "invalid_optimistic_update",
        "missing_submit_lifecycle",
        "missing_action_outcome",
        "invalid_success_message",
        "invalid_failure_message",
        "missing_destructive_confirmation",
        "invalid_confirmation_copy",
        "invalid_bulk_selection",
      ]),
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
        binding: graphqlBinding("product", "product"),
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
