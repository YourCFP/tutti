import { describe, expect, it } from "vitest";
import {
  cursorColorfulUrl,
  cursorFlatFilledIconUrl,
  resolveAgentGuiSessionProviderFlatIconUrl,
  resolveAgentGuiSessionProviderIconUrl,
  tuttiFlatFilledIconUrl
} from "./agentGuiSessionProviderIconUrls.ts";

describe("resolveAgentGuiSessionProviderIconUrl", () => {
  it("returns the colorful cursor icon for cursor sessions", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("cursor")).toBe(
      cursorColorfulUrl
    );
  });

  it("keeps the legacy flat filled cursor icon available for older callers", () => {
    expect(cursorFlatFilledIconUrl).toEqual(expect.any(String));
  });

  it("returns null for providers without a session icon override", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("hermes")).toBeNull();
  });
});

describe("resolveAgentGuiSessionProviderFlatIconUrl", () => {
  it("returns the flat filled cursor icon for masked surfaces", () => {
    expect(resolveAgentGuiSessionProviderFlatIconUrl("cursor")).toBe(
      cursorFlatFilledIconUrl
    );
  });

  it("returns the flat filled tutti icon for tutti sessions", () => {
    expect(resolveAgentGuiSessionProviderFlatIconUrl("tutti")).toBe(
      tuttiFlatFilledIconUrl
    );
    expect(resolveAgentGuiSessionProviderFlatIconUrl("nexight")).toBe(
      tuttiFlatFilledIconUrl
    );
  });

  it("returns null for providers without a flat session icon", () => {
    expect(resolveAgentGuiSessionProviderFlatIconUrl("hermes")).toBeNull();
  });
});
