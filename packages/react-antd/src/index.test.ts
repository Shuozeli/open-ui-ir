import { describe, expect, it } from "vitest";
import { compileDocument } from "@open-ui-ir/compiler-core";
import { exampleDocument } from "@open-ui-ir/compiler-core/test-fixture";
import { reactAntdTarget } from "./index.js";

describe("reactAntdTarget", () => {
  it("compiles route source", () => {
    const output = compileDocument(exampleDocument, reactAntdTarget);
    expect(output.files[0]!.path).toBe("react-antd/products.tsx");
    expect(output.files[0]!.content).toContain("antd");
  });

  it("lowers chart intent to AntV charts", () => {
    const output = compileDocument(exampleDocument, reactAntdTarget);
    const analytics = output.files.find((file) => file.path === "react-antd/products-analytics.tsx");
    expect(analytics?.content).toContain("@ant-design/charts");
    expect(analytics?.content).toContain("<Line");
  });
});
