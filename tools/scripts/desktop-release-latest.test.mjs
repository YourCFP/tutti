import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildDesktopReleaseLatest } from "../../apps/desktop/scripts/build-release-latest.mjs";

test("desktop release latest metadata exposes CloudFront URLs for every asset", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "desktop-release-latest-"));
  try {
    await writeFile(path.join(dir, "Tutti-1.2.3-mac-arm64.dmg"), "arm");
    await writeFile(path.join(dir, "Tutti-1.2.3-mac-universal.dmg"), "uni");
    await writeFile(path.join(dir, "Tutti-1.2.3-mac-x64.dmg"), "x64");
    await writeFile(path.join(dir, "Tutti-1.2.3-win-x64.exe"), "win");
    await writeFile(path.join(dir, "latest.json"), "{}");

    const latest = await buildDesktopReleaseLatest({
      assetDirPath: dir,
      releaseAssetBaseUrl:
        "https://d111111abcdef8.cloudfront.net/desktop-release-assets/",
      releaseTag: "tutti-desktop-v1.2.3"
    });

    assert.equal(latest.schemaVersion, "tutti.desktop.release.latest.v1");
    assert.equal(latest.tag, "tutti-desktop-v1.2.3");
    assert.equal(latest.version, "1.2.3");
    assert.equal(
      latest.baseUrl,
      "https://d111111abcdef8.cloudfront.net/desktop-release-assets"
    );
    assert.deepEqual(
      latest.assets.map((asset) => asset.name),
      [
        "Tutti-1.2.3-mac-arm64.dmg",
        "Tutti-1.2.3-mac-universal.dmg",
        "Tutti-1.2.3-mac-x64.dmg",
        "Tutti-1.2.3-win-x64.exe"
      ]
    );
    assert.deepEqual(
      latest.assets.map((asset) => ({
        arch: asset.arch,
        format: asset.format,
        platform: asset.platform
      })),
      [
        { arch: "arm64", format: "dmg", platform: "macos" },
        { arch: "universal", format: "dmg", platform: "macos" },
        { arch: "x64", format: "dmg", platform: "macos" },
        { arch: "x64", format: "exe", platform: "windows" }
      ]
    );
    assert.deepEqual(
      latest.assets.map((asset) => asset.url),
      [
        "https://d111111abcdef8.cloudfront.net/desktop-release-assets/tutti-desktop-v1.2.3/Tutti-1.2.3-mac-arm64.dmg",
        "https://d111111abcdef8.cloudfront.net/desktop-release-assets/tutti-desktop-v1.2.3/Tutti-1.2.3-mac-universal.dmg",
        "https://d111111abcdef8.cloudfront.net/desktop-release-assets/tutti-desktop-v1.2.3/Tutti-1.2.3-mac-x64.dmg",
        "https://d111111abcdef8.cloudfront.net/desktop-release-assets/tutti-desktop-v1.2.3/Tutti-1.2.3-win-x64.exe"
      ]
    );
    assert.ok(latest.assets.every((asset) => !("cdnUrl" in asset)));
    assert.equal(latest.downloads, undefined);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
