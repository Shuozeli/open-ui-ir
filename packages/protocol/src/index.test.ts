import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeKeysetPageToken,
  encodeKeysetPageToken,
  keysetPredicateSql,
  resourceName,
  type KeysetPageToken,
} from "./index.js";

describe("protocol helpers", () => {
  it("ships a machine-readable JSON schema for the v1 wire format", () => {
    const schema = JSON.parse(readFileSync(new URL("../../../schemas/open-ui-ir.v1.schema.json", import.meta.url), "utf8")) as {
      $id?: string;
      $defs?: { component?: { oneOf?: unknown[] }; bindingValue?: { oneOf?: unknown[] } };
    };

    expect(schema.$id).toContain("open-ui-ir.v1.schema.json");
    expect(schema.$defs?.component?.oneOf?.length).toBe(6);
    expect(schema.$defs?.bindingValue?.oneOf?.length).toBe(4);
  });

  it("builds AIP resource names", () => {
    expect(resourceName("/enrichmentContents/", "/abc")).toBe("enrichmentContents/abc");
  });

  it("roundtrips multi-key keyset tokens", () => {
    const token: KeysetPageToken = {
      version: 1,
      collection: "enrichmentContents",
      order_by: [
        { field: "last_enriched_at", direction: "desc" },
        { field: "name", direction: "asc" },
      ],
      request_fingerprint: "source_adapter=rss",
      keys: [
        { type: "datetime", value: "2026-06-07T04:19:26Z" },
        { type: "string", value: "enrichmentContents/abc" },
      ],
    };

    expect(decodeKeysetPageToken(encodeKeysetPageToken(token))).toEqual(token);
  });

  it("builds lexicographic SQL predicate", () => {
    expect(
      keysetPredicateSql([
        { field: "last_enriched_at", direction: "desc" },
        { field: "name", direction: "asc" },
      ]),
    ).toBe("(last_enriched_at < $1) OR (last_enriched_at = $1 AND name > $2)");
  });
});
