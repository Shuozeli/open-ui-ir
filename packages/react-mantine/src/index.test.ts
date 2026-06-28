import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
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
    expect(output.files[0]!.content).toContain("open-ui-mobile-cards");
    expect(output.files[0]!.content).toContain("row[\"title\"]");
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
