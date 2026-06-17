import type { DesktopComputerUsePermissionsStatus } from "../../shared/contracts/ipc.ts";

export function parseCuaDriverPermissionsStatus(
  output: string
): DesktopComputerUsePermissionsStatus | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    const startIndex = trimmed.indexOf("{");
    const endIndex = trimmed.lastIndexOf("}");
    if (startIndex < 0 || endIndex <= startIndex) {
      return null;
    }
    try {
      payload = JSON.parse(trimmed.slice(startIndex, endIndex + 1));
    } catch {
      return null;
    }
  }

  if (!isRecord(payload)) {
    return null;
  }

  const source = isRecord(payload.source)
    ? payload.source.attribution === "driver-daemon"
      ? "driver-daemon"
      : "unknown"
    : "unknown";

  return {
    accessibility: booleanOrNull(payload.accessibility),
    screenRecording: booleanOrNull(payload.screen_recording),
    screenRecordingCapturable: booleanOrNull(
      payload.screen_recording_capturable
    ),
    source
  };
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
