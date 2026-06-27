const shortCommit = __APP_COMMIT_SHA__ ? __APP_COMMIT_SHA__.slice(0, 7) : "local";

export const buildInfo = {
  version: __APP_VERSION__ || "0.0.0",
  commit: __APP_COMMIT_SHA__ || "",
  shortCommit,
  ref: __APP_COMMIT_REF__ || "local",
  buildTime: __APP_BUILD_TIME__ || "",
  label: `v${__APP_VERSION__ || "0.0.0"} · ${shortCommit}`,
};
