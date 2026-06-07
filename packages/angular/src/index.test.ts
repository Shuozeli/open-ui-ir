import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
import { angularTarget } from "./index.js";

describe("angularTarget", () => {
  it("compiles route source", () => {
    const output = compileDocument(exampleDocument, angularTarget);
    expect(output.files[0]!.path).toBe("angular/jobs-postings.component.ts");
    expect(output.files[0]!.content).toContain("@Component");
  });
});
