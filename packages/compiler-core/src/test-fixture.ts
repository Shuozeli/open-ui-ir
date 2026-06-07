import type { OpenUiDocument } from "@open-ui-ir/protocol";
import { PROTOCOL_VERSION } from "@open-ui-ir/protocol";

export const exampleDocument: OpenUiDocument = {
  protocol_version: PROTOCOL_VERSION,
  app_name: "jobs",
  display_name: "Jobs",
  capabilities: {
    layouts: ["crud_list", "detail_page"],
    component_kinds: ["filter_bar", "table", "detail_header"],
    field_renderers: [
      { kind: "text", description: "Plain text" },
      { kind: "datetime", description: "Date/time" },
    ],
    filter_kinds: ["text", "select"],
    action_methods: ["get"],
  },
  collections: [
    {
      name: "jobPostings",
      resource_type: "JobPosting",
      plural_field: "job_postings",
      list: {
        transport: "graphql",
        operation: "jobPostings",
        result_path: "jobPostings.job_postings",
        variables: {},
      },
      fields: [
        { name: "name", value_type: "string", renderer: "text", required: true, output_only: true },
        { name: "title", value_type: "string", renderer: "text", required: true, output_only: false },
        { name: "company", value_type: "string", renderer: "text", required: true, output_only: false },
        { name: "last_seen_at", value_type: "datetime", renderer: "datetime", required: false, output_only: true },
      ],
      filters: [
        { name: "q", label: "Search", kind: "text", cel_field: "title" },
        {
          name: "status",
          label: "Status",
          kind: "select",
          cel_field: "status",
          options: [
            { label: "Active", value: "active" },
            { label: "Closed", value: "closed" },
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
          { field: "last_seen_at", direction: "desc" },
          { field: "name", direction: "asc" },
        ],
        unique_key_fields: ["name"],
      },
    },
  ],
  routes: [
    {
      route: "/jobs/postings",
      title: "Job Postings",
      layout: "crud_list",
      navigation: { group: "Jobs", order: 1 },
      data_bindings: [
        {
          name: "rows",
          query: {
            transport: "graphql",
            operation: "jobPostings",
            result_path: "jobPostings.job_postings",
            variables: {},
          },
        },
      ],
      components: [
        { id: "filters", kind: "filter_bar", props: {} },
        { id: "table", kind: "table", data_ref: "rows", props: { collection: "jobPostings" } },
      ],
    },
  ],
};
