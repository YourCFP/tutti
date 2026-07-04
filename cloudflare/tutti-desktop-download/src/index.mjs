const ASSET_BASE_URL =
  "https://d1x7gb6wqsqmnm.cloudfront.net/tutti-desktop-release-assets";
const PUBLIC_DOWNLOAD_URL = "https://tutti.sh/desktop/download";
const schemaVersion = "tutti.desktop.release.latest.v1";

const channelMetadataPaths = {
  beta: "channels/beta/latest.json",
  preview: "channels/preview/latest.json",
  stable: "latest.json"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}

function normalizeChannel(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "stable") {
    return "stable";
  }
  if (normalized === "preview" || normalized === "rc") {
    return "preview";
  }
  if (normalized === "beta") {
    return "beta";
  }
  return null;
}

function normalizePlatform(value) {
  const normalized = String(value ?? "macos").trim().toLowerCase();
  if (normalized === "mac" || normalized === "darwin") {
    return "macos";
  }
  if (normalized === "win") {
    return "windows";
  }
  return normalized || "macos";
}

function normalizeArch(value) {
  const normalized = String(value ?? "universal").trim().toLowerCase();
  if (normalized === "x86_64" || normalized === "amd64") {
    return "x64";
  }
  if (normalized === "aarch64") {
    return "arm64";
  }
  return normalized || "universal";
}

function normalizeFormat(value) {
  return String(value ?? "dmg").trim().toLowerCase() || "dmg";
}

function metadataUrlForChannel(channel) {
  return `${ASSET_BASE_URL}/${channelMetadataPaths[channel]}`;
}

function matchesStableVersion(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

function matchesRcVersion(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/.test(
    value
  );
}

function matchesBetaVersion(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/.test(
    value
  );
}

function expectedMetadataChannel(channel) {
  return channel === "preview" ? "rc" : channel;
}

function validateLatestMetadata(metadata, requestedChannel) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Release metadata is missing or invalid.");
  }
  if (metadata.schemaVersion !== schemaVersion) {
    throw new Error("Release metadata schema is not supported.");
  }

  const expectedChannel = expectedMetadataChannel(requestedChannel);
  if (metadata.channel !== expectedChannel) {
    throw new Error("Release metadata channel does not match the request.");
  }

  const version = String(metadata.version ?? "");
  const tag = String(metadata.tag ?? "");
  if (tag !== `v${version}`) {
    throw new Error("Release metadata tag and version do not match.");
  }

  if (requestedChannel === "stable") {
    if (metadata.prerelease !== false || !matchesStableVersion(version)) {
      throw new Error("Stable metadata must point to a stable release.");
    }
  } else if (requestedChannel === "preview") {
    if (metadata.prerelease !== true || !matchesRcVersion(version)) {
      throw new Error("Preview metadata must point to an RC release.");
    }
  } else if (requestedChannel === "beta") {
    if (metadata.prerelease !== true || !matchesBetaVersion(version)) {
      throw new Error("Beta metadata must point to a beta release.");
    }
  }
}

function findDownloadUrl(metadata, { arch, format, platform }) {
  if (
    platform === "macos" &&
    arch === "universal" &&
    format === "dmg" &&
    metadata.preferredDownloads?.macosUniversalDmg
  ) {
    return metadata.preferredDownloads.macosUniversalDmg;
  }

  const assets = Array.isArray(metadata.assets) ? metadata.assets : [];
  const matchingAsset = assets.find(
    (asset) =>
      asset?.platform === platform &&
      asset?.arch === arch &&
      asset?.format === format &&
      typeof asset.url === "string" &&
      asset.url
  );
  return matchingAsset?.url ?? "";
}

async function fetchLatestMetadata(channel, fetcher = fetch) {
  const response = await fetcher(metadataUrlForChannel(channel), {
    cf: { cacheTtl: 60, cacheEverything: true }
  });
  if (!response.ok) {
    throw new Error(`Release metadata returned ${response.status}.`);
  }
  return response.json();
}

async function handleDownloadRequest(request, fetcher = fetch) {
  const url = new URL(request.url);
  const channel = normalizeChannel(url.searchParams.get("channel"));
  if (!channel) {
    return jsonResponse(
      {
        error: "unsupported_channel",
        message: "channel must be stable, preview, or beta"
      },
      400
    );
  }

  const platform = normalizePlatform(url.searchParams.get("platform"));
  const arch = normalizeArch(url.searchParams.get("arch"));
  const format = normalizeFormat(url.searchParams.get("format"));

  let metadata;
  try {
    metadata = await fetchLatestMetadata(channel, fetcher);
    validateLatestMetadata(metadata, channel);
  } catch (error) {
    return jsonResponse(
      {
        channel,
        error: "release_metadata_unavailable",
        message: error instanceof Error ? error.message : String(error)
      },
      502
    );
  }

  if (url.pathname === "/desktop/latest.json") {
    return jsonResponse(metadata, 200);
  }

  const downloadUrl = findDownloadUrl(metadata, { arch, format, platform });
  if (!downloadUrl) {
    return jsonResponse(
      {
        arch,
        channel,
        error: "asset_not_found",
        format,
        platform
      },
      404
    );
  }

  return Response.redirect(downloadUrl, 302);
}

export default {
  fetch(request) {
    return handleDownloadRequest(request);
  }
};

export {
  ASSET_BASE_URL,
  PUBLIC_DOWNLOAD_URL,
  expectedMetadataChannel,
  findDownloadUrl,
  handleDownloadRequest,
  metadataUrlForChannel,
  normalizeChannel,
  validateLatestMetadata
};
