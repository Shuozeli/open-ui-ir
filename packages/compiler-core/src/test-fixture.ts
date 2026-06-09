import type { OpenUiDocument } from "@open-ui-ir/protocol";
import { PROTOCOL_VERSION } from "@open-ui-ir/protocol";

export const exampleDocument: OpenUiDocument = {
  protocol_version: PROTOCOL_VERSION,
  app_name: "product-catalog",
  display_name: "Product Catalog",
  capabilities: {
    layouts: ["crud_list", "detail_page", "dashboard"],
    component_kinds: ["filter_bar", "table", "detail_header", "metric_row", "chart"],
    field_renderers: [
      { kind: "text", description: "Plain text" },
      { kind: "datetime", description: "Date/time" },
      { kind: "number", description: "Number" },
    ],
    filter_kinds: ["text", "select"],
    action_methods: ["get"],
  },
  collections: [
    {
      name: "products",
      resource_type: "Product",
      plural_field: "products",
      list: {
        transport: "graphql",
        operation: "products",
        result_path: "products.products",
        variables: {},
      },
      fields: [
        { name: "name", value_type: "string", renderer: "text", required: true, output_only: true },
        { name: "title", value_type: "string", renderer: "text", required: true, output_only: false },
        { name: "category", value_type: "string", renderer: "text", required: true, output_only: false },
        { name: "price", value_type: "number", renderer: "number", required: false, output_only: false },
        { name: "updated_at", value_type: "datetime", renderer: "datetime", required: false, output_only: true },
      ],
      filters: [
        { name: "q", label: "Search", kind: "text", cel_field: "title" },
        {
          name: "category",
          label: "Category",
          kind: "select",
          cel_field: "category",
          options: [
            { label: "Hardware", value: "hardware" },
            { label: "Software", value: "software" },
            { label: "Services", value: "services" },
          ],
        },
      ],
      actions: [],
      pagination: {
        kind: "keyset",
        page_size_param: "page_size",
        page_token_param: "page_token",
        next_page_token_path: "next_page_token",
        order_by: [
          { field: "updated_at", direction: "desc" },
          { field: "name", direction: "asc" },
        ],
        unique_key_fields: ["name"],
      },
    },
  ],
  routes: [
    {
      route: "/products",
      title: "Products",
      layout: "crud_list",
      navigation: { group: "Catalog", order: 1 },
      data_bindings: [
        {
          name: "rows",
          query: {
            transport: "graphql",
            operation: "products",
            result_path: "products.products",
            variables: {},
          },
        },
      ],
      components: [
        { id: "filters", kind: "filter_bar", props: {} },
        {
          id: "table",
          kind: "table",
          data_ref: "rows",
          props: {
            table: {
              collection: "products",
              columns: [
                { id: "title", field: "title", label: "Title", sortable: false, visible: true },
                { id: "category", field: "category", label: "Category", sortable: false, visible: true },
                { id: "price", field: "price", label: "Price", sortable: false, visible: true },
                { id: "updated", field: "updated_at", label: "Updated", sortable: true, visible: true },
              ],
            },
          },
        },
      ],
    },
    {
      route: "/products/analytics",
      title: "Product Analytics",
      layout: "dashboard",
      navigation: { group: "Catalog", order: 2 },
      data_bindings: [
        {
          name: "series",
          query: {
            transport: "graphql",
            operation: "productSalesSeries",
            result_path: "productSalesSeries.points",
            variables: {},
          },
        },
      ],
      components: [
        {
          id: "sales-by-day",
          kind: "chart",
          data_ref: "series",
          props: {
            chart: {
              kind: "line",
              title: "Sales by Day",
              encoding: { x: "day", y: "sales", color: "category" },
              height: 320,
            },
          },
        },
      ],
    },
  ],
};
