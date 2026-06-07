import { describe, expect, it } from "vitest";
import { validateDocument } from "./index.js";
import { exampleDocument } from "./test-fixture.js";

describe("validateDocument", () => {
  it("accepts the example document", () => {
    expect(validateDocument(exampleDocument)).toEqual([]);
  });

  it("requires resource name", () => {
    const doc = structuredClone(exampleDocument);
    doc.collections[0]!.fields = doc.collections[0]!.fields.filter((field) => field.name !== "name");

    expect(validateDocument(doc).map((d) => d.code)).toContain("missing_resource_name");
  });
});
