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
    expect(output.files[0]!.content).toContain("products.read");
    expect(output.files[0]!.content).toContain("openUiAuthRequirement");
    expect(output.files[0]!.content).toContain("authText");
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

  it("emits safe denied copy and redacted field presentation", () => {
    // Arrange
    const document = structuredClone(exampleDocument);
    document.routes[0]!.auth = {
      requirement: { kind: "authenticated" },
      denied_message: "Denied <admin> {copy}",
    };
    document.collections[0]!.fields.find((field) => field.name === "price")!.auth = {
      read: { kind: "permission", permission: "products.price.read" },
      unauthorized: "redact",
    };

    // Act
    const output = compileDocument(document, reactMantineTarget);
    const content = output.files[0]!.content;

    // Assert
    expect(content).toContain("{\"Denied <admin> {copy}\"}");
    expect(content).toContain("unauthorized\":\"redact");
    expect(content).toContain("Redacted");
  });

  it("lowers video components to playable html video", () => {
    // Arrange
    const document = documentWithVideo();

    // Act
    const output = compileDocument(document, reactMantineTarget);
    const content = output.files[0]!.content;

    // Assert
    expect(content).toContain("<video");
    expect(content).toContain("<source");
    expect(content).toContain("video/mp4");
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

function documentWithVideo(): OpenUiDocument {
  const document: OpenUiDocument = structuredClone(exampleDocument);
  document.capabilities.component_kinds.push("video");
  document.routes[0]!.components.push({
    id: "product-demo-video",
    kind: "video",
    video: {
      title: "Product demo",
      sources: [{ src: "/media/product-demo.mp4", type: "video/mp4" }],
      poster: "/media/product-demo.jpg",
      caption: "Short product walkthrough",
      controls: true,
      aspect_ratio: "16/9",
    },
  });
  return document;
}
