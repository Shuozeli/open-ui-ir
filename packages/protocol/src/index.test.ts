import { describe, expect, it } from "vitest";
import {
  decodeKeysetPageToken,
  encodeKeysetPageToken,
  keysetPredicateSql,
  resourceName,
  type KeysetPageToken,
} from "./index.js";

describe("protocol helpers", () => {
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
