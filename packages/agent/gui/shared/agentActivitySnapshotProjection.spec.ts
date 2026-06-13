import { describe, expect, it } from "vitest";
import { projectCoreSessionStatus } from "./agentActivitySnapshotProjection";

describe("projectCoreSessionStatus", () => {
  it("maps core idle states to ready", () => {
    expect(projectCoreSessionStatus("created")).toBe("ready");
    expect(projectCoreSessionStatus("queued")).toBe("ready");
    expect(projectCoreSessionStatus("waiting")).toBe("ready");
  });

  it("maps running to working and passes terminal states through", () => {
    expect(projectCoreSessionStatus("running")).toBe("working");
    expect(projectCoreSessionStatus("completed")).toBe("completed");
    expect(projectCoreSessionStatus("failed")).toBe("failed");
    expect(projectCoreSessionStatus("ready")).toBe("ready");
  });
});
