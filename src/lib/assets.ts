import { MAX_ASSETS, MAX_EMBEDDED_ASSET_BYTES, STORAGE_KEYS } from "./constants";
import { safeRead, safeWrite } from "./storage";
import type { MarkdownAsset } from "../types";

export function loadAssets() {
  return safeRead<MarkdownAsset[]>(STORAGE_KEYS.assets, [])
    .filter((asset) => asset && typeof asset.source === "string" && typeof asset.name === "string")
    .slice(0, MAX_ASSETS);
}

export function saveAssets(assets: MarkdownAsset[]) {
  safeWrite(STORAGE_KEYS.assets, assets.slice(0, MAX_ASSETS));
}

export async function createLocalAsset(file: File): Promise<MarkdownAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files can be added to the asset library.");
  if (file.size > MAX_EMBEDDED_ASSET_BYTES) {
    throw new Error(`${file.name} is too large for local embedding. Use a remote image URL or image host.`);
  }
  const now = Date.now();
  return {
    id: `asset-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || `image-${now}.png`,
    source: await readAsDataUrl(file),
    type: file.type || "image/png",
    size: file.size,
    provider: "local",
    createdAt: now,
    updatedAt: now,
  };
}

export function createRemoteAsset(name: string, source: string): MarkdownAsset {
  const now = Date.now();
  const cleanSource = source.trim();
  if (!/^https?:\/\//i.test(cleanSource)) throw new Error("Remote assets need an http(s) URL.");
  return {
    id: `asset-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || remoteName(cleanSource),
    source: cleanSource,
    type: "image/remote",
    size: 0,
    provider: "remote",
    createdAt: now,
    updatedAt: now,
  };
}

export function assetAlt(asset: MarkdownAsset) {
  return asset.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "image";
}

export function assetMarkdown(asset: MarkdownAsset) {
  return `![${assetAlt(asset).replace(/\]/g, "\\]")}](${asset.source.replace(/\)/g, "%29")})`;
}

export function formatAssetSize(asset: MarkdownAsset) {
  if (asset.provider === "remote") return "remote URL";
  if (asset.size >= 1024 * 1024) return `${(asset.size / 1024 / 1024).toFixed(1)} MB`;
  if (asset.size >= 1024) return `${Math.round(asset.size / 1024)} KB`;
  return `${asset.size} B`;
}

function remoteName(source: string) {
  try {
    const pathname = new URL(source).pathname;
    const name = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    return name || "remote-image";
  } catch {
    return "remote-image";
  }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read image file")));
    reader.readAsDataURL(file);
  });
}
