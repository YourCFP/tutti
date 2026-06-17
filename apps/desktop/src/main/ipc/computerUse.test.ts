import assert from "node:assert/strict";
import test from "node:test";
import { parseCuaDriverPermissionsStatus } from "./computerUsePermissions.ts";

test("parseCuaDriverPermissionsStatus maps driver-daemon permission payload", () => {
  assert.deepEqual(
    parseCuaDriverPermissionsStatus(
      JSON.stringify({
        accessibility: true,
        screen_recording: false,
        screen_recording_capturable: true,
        source: {
          attribution: "driver-daemon"
        }
      })
    ),
    {
      accessibility: true,
      screenRecording: false,
      screenRecordingCapturable: true,
      source: "driver-daemon"
    }
  );
});

test("parseCuaDriverPermissionsStatus tolerates surrounding diagnostic output", () => {
  assert.deepEqual(
    parseCuaDriverPermissionsStatus(
      [
        "cua-driver diagnostic",
        JSON.stringify({
          accessibility: true,
          screen_recording: true,
          screen_recording_capturable: true,
          source: {
            attribution: "driver-daemon"
          }
        })
      ].join("\n")
    ),
    {
      accessibility: true,
      screenRecording: true,
      screenRecordingCapturable: true,
      source: "driver-daemon"
    }
  );
});

test("parseCuaDriverPermissionsStatus falls back for invalid payloads", () => {
  assert.equal(parseCuaDriverPermissionsStatus("not json"), null);
  assert.deepEqual(parseCuaDriverPermissionsStatus("{}"), {
    accessibility: null,
    screenRecording: null,
    screenRecordingCapturable: null,
    source: "unknown"
  });
});
