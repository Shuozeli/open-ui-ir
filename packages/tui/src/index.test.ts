import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
import { tuiTarget } from "./index.js";

describe("tuiTarget", () => {
  it("compiles screen model", () => {
    const output = compileDocument(exampleDocument, tuiTarget);
    expect(output.files[0]!.path).toBe("tui/screens.json");
    expect(output.files[0]!.content).toContain("Job Postings");
  });
});
