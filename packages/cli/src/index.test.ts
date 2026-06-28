import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./index.js";

const productCatalog = new URL("../../../examples/product-catalog.ui.json", import.meta.url);

describe("open-ui-ir cli", () => {
  it("validates an IR document", async () => {
    const result = await runCli(["validate", productCatalog.pathname]);

    expect(result).toEqual({ exitCode: 0, stdout: "1 file(s) valid\n", stderr: "" });
  });

  it("returns diagnostics for invalid documents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "open-ui-ir-cli-"));
    try {
      const file = join(dir, "invalid.ui.json");
      await writeFile(file, JSON.stringify({ protocol_version: "wrong", collections: [], routes: [] }), "utf8");

      const result = await runCli(["validate", file]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("protocol_version");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("compiles to an output directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "open-ui-ir-cli-"));
    try {
      const result = await runCli(["compile", "--target", "tui", "--out", dir, productCatalog.pathname]);

      expect(result).toEqual({ exitCode: 0, stdout: `wrote 1 file(s) to ${dir}\n`, stderr: "" });
      expect(await readFile(join(dir, "tui/screens.json"), "utf8")).toContain("Products");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("compiles React Mantine source", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "open-ui-ir-cli-"));

    try {
      // Act
      const result = await runCli(["compile", "--target", "react-mantine", "--out", dir, productCatalog.pathname]);

      // Assert
      expect(result).toEqual({ exitCode: 0, stdout: `wrote 2 file(s) to ${dir}\n`, stderr: "" });
      expect(await readFile(join(dir, "react-mantine/products.tsx"), "utf8")).toContain("@mantine/core");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
