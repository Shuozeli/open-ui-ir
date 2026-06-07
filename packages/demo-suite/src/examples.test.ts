import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { angularTarget } from "@open-ui-ir/angular";
import { reactAntdTarget } from "@open-ui-ir/react-antd";
import { tuiTarget } from "@open-ui-ir/tui";
import type { OpenUiDocument } from "@open-ui-ir/protocol";
import { compileDocument, validateDocument } from "@open-ui-ir/compiler-core";

const examplesDir = new URL("../../../examples", import.meta.url);

describe("examples", () => {
  for (const file of readdirSync(examplesDir).filter((name) => name.endsWith(".ui.json"))) {
    it(`${file} validates and compiles to all current targets`, () => {
      const document = JSON.parse(readFileSync(join(examplesDir.pathname, file), "utf8")) as OpenUiDocument;
      expect(validateDocument(document)).toEqual([]);

      for (const target of [reactAntdTarget, angularTarget, tuiTarget]) {
        const output = compileDocument(document, target);
        expect(output.diagnostics).toEqual([]);
        expect(output.files.length).toBeGreaterThan(0);
      }
    });
  }
});
