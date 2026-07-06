import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
import type { OpenUiDocument } from "@open-ui-ir/protocol";
import { reactMantineTarget } from "./index.js";

describe("reactMantineTarget", () => {
  it("compiles route source", () => {
    // Arrange
    const document = exampleDocument;

    // Act
    const output = compileDocument(document, reactMantineTarget);

    // Assert
    expect(output.files[0]!.path).toBe("react-mantine/products.tsx");
    expect(output.files[0]!.content).toContain("@mantine/core");
    expect(output.files[0]!.content).toContain("<Table");
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
    const output = compileDocument(document, reactMantineTarget);

    // Assert
    expect(output.files[0]!.content).toContain("products.delete");
    expect(output.files[0]!.content).toContain("unauthorized\":\"disable");
    expect(output.files[0]!.content).toContain("disabled={!can(action.auth, authContext)}");
  });

  it("lowers supported chart intent to Mantine charts", () => {
    // Arrange
    const document = exampleDocument;

    // Act
    const output = compileDocument(document, reactMantineTarget);
    const analytics = output.files.find((file) => file.path === "react-mantine/products-analytics.tsx");

    // Assert
    expect(analytics?.content).toContain("@mantine/charts");
    expect(analytics?.content).toContain("<LineChart");
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
