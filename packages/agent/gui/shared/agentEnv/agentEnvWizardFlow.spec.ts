import { describe, expect, it } from "vitest";
import {
  deriveAgentSetupStages,
  projectRevealedStages,
  resolveWizardAutoStartAction,
  shouldAdvanceReveal,
  type AgentSetupStage,
  type DeriveAgentSetupStagesInput
} from "./agentEnvWizardFlow";

const labels = {
  detect: "Detect",
  install: "Install",
  adapter: "Adapter",
  login: "Login",
  ready: "Ready"
};

function input(
  overrides: Partial<DeriveAgentSetupStagesInput> = {}
): DeriveAgentSetupStagesInput {
  return {
    detected: true,
    cliInstalled: false,
    versionTooOld: false,
    adapterInstalled: false,
    adapterVersionMismatch: false,
    authenticated: false,
    authRequired: false,
    ready: false,
    activePhase: null,
    installActionPending: false,
    loginPending: false,
    cliVersionDetail: null,
    adapterDetail: null,
    accountDetail: null,
    labels,
    ...overrides
  };
}

describe("deriveAgentSetupStages", () => {
  it("renders the fixed 5-stage track in order", () => {
    const stages = deriveAgentSetupStages(input());
    expect(stages.map((s) => s.id)).toEqual([
      "detect",
      "install",
      "adapter",
      "login",
      "ready"
    ]);
  });

  it("shows detect running and the rest pending before status is known", () => {
    const stages = deriveAgentSetupStages(input({ detected: false }));
    expect(stages.map((s) => [s.id, s.status])).toEqual([
      ["detect", "running"],
      ["install", "pending"],
      ["adapter", "pending"],
      ["login", "pending"],
      ["ready", "pending"]
    ]);
  });

  it("marks install and adapter running while the active phase is installing", () => {
    const stages = deriveAgentSetupStages(input({ activePhase: "install" }));
    expect(stage(stages, "detect").status).toBe("ok");
    expect(stage(stages, "install").status).toBe("running");
    expect(stage(stages, "adapter").status).toBe("running");
    expect(stage(stages, "login").status).toBe("pending");
  });

  it("flags install as error when the version is too old", () => {
    const stages = deriveAgentSetupStages(
      input({
        cliInstalled: true,
        versionTooOld: true,
        cliVersionDetail: "0.100.0"
      })
    );
    expect(stage(stages, "install").status).toBe("error");
    expect(stage(stages, "install").detail).toBe("0.100.0");
  });

  it("marks adapter pending when CLI is installed but the adapter is missing", () => {
    const stages = deriveAgentSetupStages(
      input({ cliInstalled: true, adapterInstalled: false })
    );
    expect(stage(stages, "install").status).toBe("ok");
    expect(stage(stages, "adapter").status).toBe("pending");
  });

  it("shows the adapter running on a pending install action even without an activePhase (claude-code adapter installer emits no phase)", () => {
    const stages = deriveAgentSetupStages(
      input({
        cliInstalled: true,
        adapterInstalled: false,
        installActionPending: true,
        activePhase: null
      })
    );
    expect(stage(stages, "install").status).toBe("ok");
    expect(stage(stages, "adapter").status).toBe("running");
  });

  it("marks adapter ok and error from its own flags", () => {
    expect(
      stage(
        deriveAgentSetupStages(
          input({
            cliInstalled: true,
            adapterInstalled: true,
            adapterDetail: "claude-acp"
          })
        ),
        "adapter"
      )
    ).toMatchObject({ status: "ok", detail: "claude-acp" });
    expect(
      stage(
        deriveAgentSetupStages(
          input({
            cliInstalled: true,
            adapterInstalled: true,
            adapterVersionMismatch: true
          })
        ),
        "adapter"
      ).status
    ).toBe("error");
  });

  it("marks login running while a login action is pending", () => {
    const stages = deriveAgentSetupStages(
      input({
        cliInstalled: true,
        adapterInstalled: true,
        authRequired: true,
        loginPending: true,
        cliVersionDetail: "0.142.1"
      })
    );
    expect(stage(stages, "install").status).toBe("ok");
    expect(stage(stages, "adapter").status).toBe("ok");
    expect(stage(stages, "login").status).toBe("running");
  });

  it("marks login pending (not error) when auth is required but install is not done", () => {
    const stages = deriveAgentSetupStages(input({ authRequired: true }));
    expect(stage(stages, "login").status).toBe("pending");
  });

  it("marks every stage ok when ready", () => {
    const stages = deriveAgentSetupStages(
      input({
        cliInstalled: true,
        adapterInstalled: true,
        authenticated: true,
        ready: true,
        activePhase: "done",
        cliVersionDetail: "0.142.1",
        accountDetail: "user@example.com"
      })
    );
    expect(stages.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(stage(stages, "login").detail).toBe("user@example.com");
  });
});

describe("projectRevealedStages / shouldAdvanceReveal", () => {
  const allOk: AgentSetupStage[] = [
    { id: "detect", label: "Detect", status: "ok", detail: null },
    { id: "install", label: "Install", status: "ok", detail: null },
    { id: "adapter", label: "Adapter", status: "ok", detail: null },
    { id: "login", label: "Login", status: "ok", detail: null },
    { id: "ready", label: "Ready", status: "ok", detail: null }
  ];

  it("shows revealed stages real, the cursor as running, and the rest pending", () => {
    const projected = projectRevealedStages(allOk, 2);
    expect(projected.map((s) => s.status)).toEqual([
      "ok", // 0 revealed
      "ok", // 1 revealed
      "running", // 2 cursor (real ok shown as working)
      "pending", // 3 not yet revealed
      "pending" // 4 not yet revealed
    ]);
  });

  it("advances past a really-ok cursor stage", () => {
    expect(shouldAdvanceReveal(allOk, 0)).toBe(true);
    expect(shouldAdvanceReveal(allOk, 4)).toBe(true);
  });

  it("stops advancing once the whole track is revealed", () => {
    expect(shouldAdvanceReveal(allOk, allOk.length)).toBe(false);
  });

  it("parks the cursor on a running, error, or pending stage", () => {
    const stages: AgentSetupStage[] = [
      { id: "detect", label: "Detect", status: "ok", detail: null },
      { id: "install", label: "Install", status: "running", detail: null },
      { id: "adapter", label: "Adapter", status: "pending", detail: null },
      { id: "login", label: "Login", status: "pending", detail: null },
      { id: "ready", label: "Ready", status: "pending", detail: null }
    ];
    expect(shouldAdvanceReveal(stages, 1)).toBe(false); // running install
    // the cursor stage shows its real (running) status, not a synthetic one
    expect(stage(projectRevealedStages(stages, 1), "install").status).toBe(
      "running"
    );
    const errored: AgentSetupStage[] = [
      { id: "detect", label: "Detect", status: "ok", detail: null },
      { id: "install", label: "Install", status: "error", detail: null }
    ];
    expect(shouldAdvanceReveal(errored, 1)).toBe(false);
    expect(stage(projectRevealedStages(errored, 1), "install").status).toBe(
      "error"
    );
  });
});

describe("resolveWizardAutoStartAction", () => {
  const base = {
    detected: true,
    ready: false,
    installPending: false,
    loginPending: false
  };

  it("returns install for install/repair/upgrade focus", () => {
    expect(resolveWizardAutoStartAction({ ...base, focus: "install" })).toBe(
      "install"
    );
    expect(resolveWizardAutoStartAction({ ...base, focus: "repair" })).toBe(
      "install"
    );
    expect(resolveWizardAutoStartAction({ ...base, focus: "upgrade" })).toBe(
      "install"
    );
  });

  it("returns login for auth focus", () => {
    expect(resolveWizardAutoStartAction({ ...base, focus: "auth" })).toBe(
      "login"
    );
  });

  it("returns null for non-remediation focus", () => {
    expect(
      resolveWizardAutoStartAction({ ...base, focus: "detect" })
    ).toBeNull();
    expect(
      resolveWizardAutoStartAction({ ...base, focus: "network" })
    ).toBeNull();
    expect(
      resolveWizardAutoStartAction({ ...base, focus: "registry" })
    ).toBeNull();
    expect(resolveWizardAutoStartAction({ ...base, focus: null })).toBeNull();
  });

  it("returns null until detection has settled", () => {
    expect(
      resolveWizardAutoStartAction({
        ...base,
        detected: false,
        focus: "install"
      })
    ).toBeNull();
  });

  it("returns null when already ready", () => {
    expect(
      resolveWizardAutoStartAction({ ...base, ready: true, focus: "auth" })
    ).toBeNull();
  });

  it("returns null when the matching action is already pending", () => {
    expect(
      resolveWizardAutoStartAction({
        ...base,
        focus: "install",
        installPending: true
      })
    ).toBeNull();
    expect(
      resolveWizardAutoStartAction({
        ...base,
        focus: "auth",
        loginPending: true
      })
    ).toBeNull();
  });
});

function stage(stages: AgentSetupStage[], id: string) {
  const found = stages.find((s) => s.id === id);
  if (!found) {
    throw new Error(`stage ${id} not found`);
  }
  return found;
}
