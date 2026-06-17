import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  desktopIpcChannels,
  type DesktopComputerUseStatus
} from "../../shared/contracts/ipc.ts";
import { registerDesktopIpcHandler } from "./handle.ts";
import { parseCuaDriverPermissionsStatus } from "./computerUsePermissions.ts";

const CUA_DRIVER_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh";
const CUA_DRIVER_UNINSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/uninstall.sh";
const CUA_DRIVER_APP_BINARY_PATH =
  "/Applications/CuaDriver.app/Contents/MacOS/cua-driver";

function cuaDriverExecutableCandidates(): string[] {
  return [
    `${process.env.HOME}/.local/bin/cua-driver`,
    "/usr/local/bin/cua-driver",
    "/opt/homebrew/bin/cua-driver",
    CUA_DRIVER_APP_BINARY_PATH
  ];
}

function resolveCuaDriverExecutable(): string | null {
  for (const candidate of cuaDriverExecutableCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isCuaDriverInstalled(): boolean {
  if (process.platform !== "darwin") {
    return false;
  }
  if (existsSync("/Applications/CuaDriver.app")) {
    return true;
  }
  return resolveCuaDriverExecutable() !== null;
}

function runSubprocess(
  command: string,
  args: string[]
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, {
      env: {
        ...process.env,
        // Ensure ~/.local/bin is on PATH for cua-driver lookups
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: Buffer.concat(chunks).toString("utf8")
      });
    });

    child.on("error", (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

async function checkCuaDriverStatus(): Promise<DesktopComputerUseStatus> {
  const installed = isCuaDriverInstalled();
  if (!installed) {
    return { installed: false, permissions: null };
  }

  const executable = resolveCuaDriverExecutable();
  if (!executable) {
    return { installed: true, permissions: null };
  }

  const permissionsResult = await runSubprocess(executable, [
    "permissions",
    "status",
    "--json"
  ]);
  if (!permissionsResult.success) {
    return { installed: true, permissions: null };
  }

  return {
    installed: true,
    permissions: parseCuaDriverPermissionsStatus(permissionsResult.output)
  };
}

export function registerComputerUseIpc(): void {
  registerDesktopIpcHandler(desktopIpcChannels.computerUse.checkStatus, () =>
    checkCuaDriverStatus()
  );

  registerDesktopIpcHandler(desktopIpcChannels.computerUse.install, () =>
    runSubprocess("/bin/bash", [
      "-c",
      `curl -fsSL ${CUA_DRIVER_INSTALL_SCRIPT_URL} | bash`
    ])
  );

  registerDesktopIpcHandler(desktopIpcChannels.computerUse.uninstall, () =>
    runSubprocess("/bin/bash", [
      "-c",
      `curl -fsSL ${CUA_DRIVER_UNINSTALL_SCRIPT_URL} | bash`
    ])
  );

  registerDesktopIpcHandler(
    desktopIpcChannels.computerUse.grantPermissions,
    () => {
      const executable = resolveCuaDriverExecutable() ?? "cua-driver";
      return runSubprocess(executable, ["permissions", "grant"]);
    }
  );
}
