import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
import type { OpenUiDocument } from "@open-ui-ir/protocol";
import { reactAntdTarget } from "./index.js";

describe("reactAntdTarget", () => {
  it("compiles route source", () => {
    const output = compileDocument(exampleDocument, reactAntdTarget);
    expect(output.files[0]!.path).toBe("react-antd/products.tsx");
    expect(output.files[0]!.content).toContain("antd");
    expect(output.files[0]!.content).toContain("authContext");
    expect(output.files[0]!.content).toContain("products.price.read");
    expect(output.files[0]!.content).toContain("Access denied");
    expect(output.files[0]!.content).toContain("Access denied for Products");
    expect(output.files[0]!.content).toContain("open-ui-mobile-cards");
    expect(output.files[0]!.content).toContain("row[\"title\"]");
  });

  it("lowers action auth to hide or disable buttons", () => {
    // Arrange
    const document = documentWithActions();

    // Act
    const output = compileDocument(document, reactAntdTarget);

    // Assert
    expect(output.files[0]!.content).toContain("products.delete");
    expect(output.files[0]!.content).toContain("unauthorized\":\"disable");
    expect(output.files[0]!.content).toContain("disabled={!can(action.auth, authContext)}");
  });

  it("lowers chart intent to AntV charts", () => {
    const output = compileDocument(exampleDocument, reactAntdTarget);
    const analytics = output.files.find((file) => file.path === "react-antd/products-analytics.tsx");
    expect(analytics?.content).toContain("@ant-design/charts");
    expect(analytics?.content).toContain("<Line");
  });
});

function documentWithActions(): OpenUiDocument {
  const document: OpenUiDocument = structuredClone(exampleDocument);
  document.capabilities.action_methods = ["get", "delete"];
  const collection = document.collections[0]!;
  collection.actions = [
    {
      name: "delete",
      label: "Delete",
      method: "delete",
      binding: {
        transport: "graphql",
        operation: "deleteProduct",
        variables: {
          name: { kind: "resource", path: "name" },
        },
        result: { path: "deleteProduct" },
      },
      auth: {
        invoke: { kind: "permission", permission: "products.delete" },
        unauthorized: "disable",
      },
    },
  ];
  const table = document.routes[0]!.components.find((component) => component.kind === "table");
  if (table?.kind === "table") {
    table.table.row_actions = ["delete"];
  }
  return document;
}
