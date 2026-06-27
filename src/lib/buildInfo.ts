const shortCommit = __APP_COMMIT_SHA__ ? __APP_COMMIT_SHA__.slice(0, 7) : "local";
const version = __APP_VERSION__ || "0.0.0";
const versionTag = shortCommit === "local" ? `v${version}` : `v${version}+${shortCommit}`;

export const buildInfo = {
  version,
  versionTag,
  commit: __APP_COMMIT_SHA__ || "",
  shortCommit,
  ref: __APP_COMMIT_REF__ || "local",
  buildTime: __APP_BUILD_TIME__ || "",
  label: versionTag,
};
