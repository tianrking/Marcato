import { createServer } from "vite";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function localAsset(index) {
  return {
    id: `asset-test-${index}`,
    name: `image-${index}.png`,
    source: `data:image/png;base64,${index}`,
    type: "image/png",
    size: 1,
    provider: "local",
    createdAt: index,
    updatedAt: index,
  };
}

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const assets = await server.ssrLoadModule("/src/lib/assets.ts");
  const candidates = Array.from({ length: 50 }, (_, index) => ({
    asset: localAsset(index),
    paths: [`bundle/images/image-${index}.png`, `images/image-${index}.png`],
  }));

  const lateReferences = "![Forty nine](./images/image-49.png)\n\n![Forty eight](./images/image-48.png)";
  const analyzedLateReferences = assets.embedLocalImagesInMarkdown(lateReferences, candidates, "bundle/post.md");
  const prioritized = assets.selectAssetsForStorage(
    candidates.map((candidate) => candidate.asset),
    analyzedLateReferences.usedAssetIds,
  );
  expect(prioritized.length === 40, `Expected the 40-asset limit, got ${prioritized.length}.`);
  expect(prioritized[0].id === "asset-test-49" && prioritized[1].id === "asset-test-48", "Referenced bundle images should be retained before unreferenced candidates.");

  const allReferences = candidates.map((_, index) => `![Image ${index}](./images/image-${index}.png)`).join("\n\n");
  const analyzedAllReferences = assets.embedLocalImagesInMarkdown(allReferences, candidates, "bundle/post.md");
  const stored = assets.selectAssetsForStorage(
    candidates.map((candidate) => candidate.asset),
    analyzedAllReferences.usedAssetIds,
  );
  const storedIds = new Set(stored.map((asset) => asset.id));
  const retainedCandidates = candidates.filter((candidate) => storedIds.has(candidate.asset.id));
  const finalized = assets.embedLocalImagesInMarkdown(allReferences, retainedCandidates, "bundle/post.md");
  const finalizedReferenceIds = assets.collectAssetReferenceIds(finalized.markdown);
  expect(finalized.embeddedCount === 40, `Expected 40 retained bundle references, got ${finalized.embeddedCount}.`);
  expect(finalizedReferenceIds.size === 40, `Expected 40 compact asset references, got ${finalizedReferenceIds.size}.`);
  expect([...finalizedReferenceIds].every((id) => storedIds.has(id)), "Final Markdown must not reference an asset discarded by the storage limit.");
  expect(finalized.markdown.includes("./images/image-40.png"), "Discarded candidates should keep their original portable local paths.");

  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      localStorage: {
        setItem() {
          throw new Error("quota exceeded");
        },
      },
    };
    expect(assets.saveAssets(stored) === false, "Asset persistence failures should be reported to the caller.");

    let persisted = "";
    globalThis.window = {
      localStorage: {
        setItem(_key, value) {
          persisted = value;
        },
      },
    };
    expect(assets.saveAssets(stored) === true, "Successful asset persistence should be reported to the caller.");
    expect(JSON.parse(persisted).length === 40, "Successful persistence should store the bounded asset collection.");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
} finally {
  await server.close();
}

console.log("Asset integrity unit tests passed.");
