import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_BASE_URL,
  handleDownloadRequest,
  metadataUrlForChannel,
  normalizeChannel,
  validateLatestMetadata
} from "./index.mjs";

function makeMetadata(overrides = {}) {
  const version = overrides.version ?? "1.2.3";
  const tag = overrides.tag ?? `v${version}`;
  const channel = overrides.channel ?? "stable";
  return {
    schemaVersion: "tutti.desktop.release.latest.v1",
    tag,
    version,
    channel,
    prerelease: channel !== "stable",
    preferredDownloads: {
      macosUniversalDmg: `${ASSET_BASE_URL}/${tag}/Tutti-${version}-mac-universal.dmg`
    },
    assets: [
      {
        platform: "macos",
        arch: "universal",
        format: "dmg",
        name: `Tutti-${version}-mac-universal.dmg`,
        url: `${ASSET_BASE_URL}/${tag}/Tutti-${version}-mac-universal.dmg`
      },
      {
        platform: "macos",
        arch: "arm64",
        format: "dmg",
        name: `Tutti-${version}-mac-arm64.dmg`,
        url: `${ASSET_BASE_URL}/${tag}/Tutti-${version}-mac-arm64.dmg`
      }
    ],
    ...overrides
  };
}

function makeFetcher(metadataByUrl) {
  return async (url) => {
    const metadata = metadataByUrl[url];
    if (!metadata) {
      return new Response("not found", { status: 404 });
    }
    return Response.json(metadata);
  };
}

test("download worker defaults to stable latest metadata", async () => {
  const metadata = makeMetadata();
  const response = await handleDownloadRequest(
    new Request(
      "https://tutti.sh/desktop/download?platform=macos&arch=universal&format=dmg"
    ),
    makeFetcher({ [metadataUrlForChannel("stable")]: metadata })
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    metadata.preferredDownloads.macosUniversalDmg
  );
});

test("download worker maps preview to rc latest metadata", async () => {
  const metadata = makeMetadata({
    channel: "rc",
    version: "1.2.4-rc.1",
    tag: "v1.2.4-rc.1"
  });
  const response = await handleDownloadRequest(
    new Request(
      "https://tutti.sh/desktop/download?channel=preview&platform=macos&arch=arm64&format=dmg"
    ),
    makeFetcher({ [metadataUrlForChannel("preview")]: metadata })
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    `${ASSET_BASE_URL}/v1.2.4-rc.1/Tutti-1.2.4-rc.1-mac-arm64.dmg`
  );
});

test("download worker maps beta to beta latest metadata", async () => {
  const metadata = makeMetadata({
    channel: "beta",
    version: "1.2.4-beta.1",
    tag: "v1.2.4-beta.1"
  });
  const response = await handleDownloadRequest(
    new Request("https://tutti.sh/desktop/latest.json?channel=beta"),
    makeFetcher({ [metadataUrlForChannel("beta")]: metadata })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).channel, "beta");
});

test("download worker rejects beta metadata for preview", () => {
  assert.throws(
    () =>
      validateLatestMetadata(
        makeMetadata({
          channel: "beta",
          version: "1.2.4-beta.1",
          tag: "v1.2.4-beta.1"
        }),
        "preview"
      ),
    /channel does not match/
  );
});

test("download worker rejects prerelease metadata for stable", () => {
  assert.throws(
    () =>
      validateLatestMetadata(
        makeMetadata({
          channel: "rc",
          version: "1.2.4-rc.1",
          tag: "v1.2.4-rc.1"
        }),
        "stable"
      ),
    /channel does not match/
  );
});

test("download worker rejects unsupported channels", () => {
  assert.equal(normalizeChannel("nightly"), null);
});
