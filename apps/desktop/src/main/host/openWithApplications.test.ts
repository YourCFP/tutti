import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  filterOpenWithApplications,
  listOpenWithApplications,
  openFileWithApplication,
  openFileWithDefaultBrowser,
  parseListOpenWithApplicationsLine,
  pickOpenWithApplication,
  readDefaultApplicationIconDataUrl,
  resetOpenWithApplicationsCacheForTests
} from "./openWithApplications.ts";
import { resolveOpenWithApplicationIconOverrideDataUrl } from "../../shared/openWithApplicationIconOverrides.ts";

test("pickOpenWithApplication returns null on non-macOS", async (t) => {
  if (process.platform === "darwin") {
    t.skip("non-macOS only");
    return;
  }

  assert.equal(await pickOpenWithApplication(), null);
});

test("filterOpenWithApplications removes video players from text file handlers", () => {
  assert.deepEqual(
    filterOpenWithApplications(
      [
        {
          applicationPath: "/System/Applications/QuickTime Player.app",
          iconDataUrl: null,
          name: "QuickTime Player"
        },
        {
          applicationPath: "/Applications/Visual Studio Code.app",
          iconDataUrl: null,
          name: "Visual Studio Code"
        }
      ],
      "/tmp/example.ts"
    ),
    [
      {
        applicationPath: "/Applications/Visual Studio Code.app",
        iconDataUrl: null,
        name: "Visual Studio Code"
      }
    ]
  );
});

test("open with application icons override Cursor and Antigravity", () => {
  assert.match(
    resolveOpenWithApplicationIconOverrideDataUrl({
      applicationPath: "/Applications/Cursor.app",
      name: "Cursor"
    }) ?? "",
    /^data:image\/png;base64,/
  );
  assert.match(
    resolveOpenWithApplicationIconOverrideDataUrl({
      applicationPath: "/Applications/Antigravity.app",
      name: "Antigravity"
    }) ?? "",
    /^data:image\/png;base64,/
  );
  assert.equal(
    resolveOpenWithApplicationIconOverrideDataUrl({
      applicationPath: "/Applications/TextEdit.app",
      name: "TextEdit"
    }),
    null
  );
});

test("parseListOpenWithApplicationsLine decodes workspace icon payloads", () => {
  assert.deepEqual(
    parseListOpenWithApplicationsLine(
      "Preview\t/System/Applications/Preview.app\tYWJj"
    ),
    {
      applicationPath: "/System/Applications/Preview.app",
      iconDataUrl: "data:image/png;base64,YWJj",
      name: "Preview"
    }
  );
  assert.deepEqual(
    parseListOpenWithApplicationsLine("Safari\t/Applications/Safari.app\t"),
    {
      applicationPath: "/Applications/Safari.app",
      iconDataUrl: null,
      name: "Safari"
    }
  );
  assert.equal(parseListOpenWithApplicationsLine("invalid"), null);
});

test("listOpenWithApplications returns installed handlers on macOS", async (t) => {
  if (process.platform !== "darwin") {
    t.skip("macOS only");
    return;
  }

  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "nextop-open-with-list-")
  );
  const targetPath = path.join(workspaceRoot, "notes.txt");
  await writeFile(targetPath, "hello", "utf8");

  resetOpenWithApplicationsCacheForTests();
  const applications = await listOpenWithApplications(targetPath);
  assert.ok(applications.length > 0);
  assert.equal(
    applications.some((application) => /quicktime/i.test(application.name)),
    false
  );
  assert.ok(applications.every((application) => application.name.length > 0));
  assert.ok(
    applications.every((application) =>
      application.applicationPath.endsWith(".app")
    )
  );
  assert.ok(
    applications.some(
      (application) =>
        typeof application.iconDataUrl === "string" &&
        application.iconDataUrl.startsWith("data:image/png;base64,")
    )
  );
});

test("readDefaultApplicationIconDataUrl returns default handler icon on macOS", async (t) => {
  if (process.platform !== "darwin") {
    t.skip("macOS only");
    return;
  }

  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "nextop-default-app-icon-")
  );
  const targetPath = path.join(workspaceRoot, "notes.txt");
  await writeFile(targetPath, "hello", "utf8");

  resetOpenWithApplicationsCacheForTests();
  const iconDataUrl = await readDefaultApplicationIconDataUrl(targetPath);
  if (!iconDataUrl) {
    t.skip("default application icon unavailable in this test environment");
    return;
  }

  assert.match(iconDataUrl, /^data:image\/png;base64,/);
});

test("openFileWithDefaultBrowser delegates to the macOS browser opener without launching it in tests", async (t) => {
  if (process.platform !== "darwin") {
    t.skip("macOS only");
    return;
  }

  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "nextop-open-with-default-browser-")
  );
  const targetPath = path.join(workspaceRoot, "notes.html");
  await writeFile(targetPath, "<html></html>", "utf8");
  const calls: Array<{ args?: readonly string[]; file: string }> = [];

  await openFileWithDefaultBrowser(targetPath, {
    execFile: async (file, args) => {
      calls.push({ args, file });
      return { stderr: "", stdout: "" };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file, "swift");
  assert.ok(calls[0]?.args?.[0]?.endsWith("openFileWithDefaultBrowser.swift"));
  assert.equal(calls[0]?.args?.[1], path.resolve(targetPath));
});

test("openFileWithApplication delegates to macOS open without launching the application in tests", async (t) => {
  if (process.platform !== "darwin") {
    t.skip("macOS only");
    return;
  }

  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "nextop-open-with-open-")
  );
  const targetPath = path.join(workspaceRoot, "notes.txt");
  const applicationPath = path.join(workspaceRoot, "TextEdit.app");
  await writeFile(targetPath, "hello", "utf8");
  await mkdir(applicationPath);
  const calls: Array<{ args?: readonly string[]; file: string }> = [];

  await openFileWithApplication(targetPath, applicationPath, {
    execFile: async (file, args) => {
      calls.push({ args, file });
      return { stderr: "", stdout: "" };
    }
  });

  assert.deepEqual(calls, [
    {
      file: "open",
      args: ["-a", path.resolve(applicationPath), path.resolve(targetPath)]
    }
  ]);
});
