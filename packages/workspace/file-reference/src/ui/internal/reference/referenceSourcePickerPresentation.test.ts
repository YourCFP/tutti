import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReferenceNode } from "../../../contracts/referenceSource.ts";
import {
  formatHierarchyTitle,
  formatReferencePreviewDateTime
} from "./referenceSourcePickerPresentation.ts";

function folder(nodeId: string, displayName: string): ReferenceNode {
  return {
    displayName,
    kind: "folder",
    ref: { sourceId: "workspace-file", nodeId }
  };
}

test("formatHierarchyTitle exposes the complete hierarchy path", () => {
  const title = formatHierarchyTitle([
    folder("Documents", "文稿"),
    folder("Documents/tutti", "tutti"),
    folder("Documents/tutti/tutti_research", "tutti_research"),
    folder("Documents/tutti/tutti_research/user-interviews", "用户访谈记录文档")
  ]);

  assert.equal(title, "文稿 / tutti / tutti_research / 用户访谈记录文档");
});

test("formatHierarchyTitle omits empty hierarchy paths", () => {
  assert.equal(formatHierarchyTitle([]), null);
});

test("formatReferencePreviewDateTime formats timestamps in the requested user time zone", () => {
  const timestamp = Date.UTC(2026, 5, 12, 3, 24);

  assert.equal(
    formatReferencePreviewDateTime(timestamp, {
      locale: "en",
      timeZone: "UTC"
    }),
    "2026-06-12 03:24"
  );
  assert.equal(
    formatReferencePreviewDateTime(timestamp, {
      locale: "en",
      timeZone: "Asia/Shanghai"
    }),
    "2026-06-12 11:24"
  );
});
