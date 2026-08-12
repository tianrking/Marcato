import { MAX_ASSETS, MAX_EMBEDDED_ASSET_BYTES, STORAGE_KEYS } from "./constants";
import { safeRead, safeWrite } from "./storage";
import type { MarkdownAsset } from "../types";

export interface LocalAssetCandidate {
  asset: MarkdownAsset;
  paths: string[];
}

export interface EmbeddedMarkdownImages {
  embeddedCount: number;
  markdown: string;
  usedAssetIds: Set<string>;
}

const INLINE_IMAGE_SOURCE_PATTERN = /(!\[[^\]\r\n]*\]\(\s*)(<[^>\r\n]+>|[^\s)\r\n]+)/g;
const HTML_IMAGE_SOURCE_PATTERN = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi;
const REFERENCE_IMAGE_PATTERN = /!\[([^\]\r\n]*)\]\[([^\]\r\n]*)\]/g;
const REFERENCE_DEFINITION_PATTERN = /^(\s{0,3}\[([^\]\r\n]+)\]:\s*)(<[^>\r\n]+>|[^\s\r\n]+)(.*)$/gm;
const ASSET_REFERENCE_PATTERN = /marcato-asset:([a-z0-9-]+)/gi;

export function loadAssets() {
  return safeRead<MarkdownAsset[]>(STORAGE_KEYS.assets, [])
    .filter((asset) => asset && typeof asset.source === "string" && typeof asset.name === "string")
    .slice(0, MAX_ASSETS);
}

export function saveAssets(assets: MarkdownAsset[]) {
  safeWrite(STORAGE_KEYS.assets, assets.slice(0, MAX_ASSETS));
}

export async function createLocalAsset(file: File): Promise<MarkdownAsset> {
  return (await createLocalAssetCandidate(file)).asset;
}

export async function createLocalAssetCandidate(file: File): Promise<LocalAssetCandidate> {
  const type = imageMimeType(file);
  if (!type) throw new Error("Only image files can be added to the asset library.");
  if (file.size > MAX_EMBEDDED_ASSET_BYTES) {
    throw new Error(`${file.name} is too large for local embedding. Use a remote image URL or image host.`);
  }
  const now = Date.now();
  const asset: MarkdownAsset = {
    id: `asset-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || `image-${now}.png`,
    source: await readAsDataUrl(file, type),
    type,
    size: file.size,
    provider: "local",
    createdAt: now,
    updatedAt: now,
  };
  return {
    asset,
    paths: localFilePaths(file),
  };
}

export function embedLocalImagesInMarkdown(markdown: string, candidates: LocalAssetCandidate[], documentPath = ""): EmbeddedMarkdownImages {
  if (!markdown || candidates.length === 0) return { embeddedCount: 0, markdown, usedAssetIds: new Set() };

  const exactPaths = new Map<string, LocalAssetCandidate | null>();
  const baseNames = new Map<string, LocalAssetCandidate | null>();
  for (const candidate of candidates) {
    for (const path of candidate.paths) addUniqueCandidate(exactPaths, path, candidate);
    addUniqueCandidate(baseNames, fileName(candidate.asset.name), candidate);
  }

  const usedAssetIds = new Set<string>();
  let embeddedCount = 0;
  const documentDirectory = normalizeLocalPath(documentPath).split("/").slice(0, -1).join("/");
  const resolve = (rawSource: string) => {
    const source = unwrapAngleBrackets(rawSource).trim();
    if (!source || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(source)) return "";
    const normalized = normalizeLocalPath(source);
    const documentRelative = documentDirectory ? normalizeLocalPath(`${documentDirectory}/${source}`) : "";
    const candidate = (documentRelative ? exactPaths.get(documentRelative) : undefined)
      || exactPaths.get(normalized)
      || baseNames.get(fileName(normalized));
    if (!candidate) return "";
    usedAssetIds.add(candidate.asset.id);
    embeddedCount += 1;
    return assetReference(candidate.asset);
  };

  const imageReferenceIds = new Set<string>();
  for (const match of markdown.matchAll(REFERENCE_IMAGE_PATTERN)) {
    imageReferenceIds.add(normalizeReferenceId(match[2] || match[1] || ""));
  }

  let next = markdown.replace(INLINE_IMAGE_SOURCE_PATTERN, (match, prefix: string, rawSource: string) => {
    const resolved = resolve(rawSource);
    return resolved ? `${prefix}${resolved}` : match;
  });
  next = next.replace(HTML_IMAGE_SOURCE_PATTERN, (match, prefix: string, rawSource: string, suffix: string) => {
    const resolved = resolve(rawSource);
    return resolved ? `${prefix}${resolved}${suffix}` : match;
  });
  next = next.replace(REFERENCE_DEFINITION_PATTERN, (match, prefix: string, rawId: string, rawSource: string, suffix: string) => {
    if (!imageReferenceIds.has(normalizeReferenceId(rawId))) return match;
    const resolved = resolve(rawSource);
    return resolved ? `${prefix}${resolved}${suffix}` : match;
  });

  return { embeddedCount, markdown: next, usedAssetIds };
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
  return `![${assetAlt(asset).replace(/\]/g, "\\]")}](${assetReference(asset).replace(/\)/g, "%29")})`;
}

export function assetReference(asset: MarkdownAsset) {
  return asset.provider === "local" ? `marcato-asset:${asset.id}` : asset.source;
}

export function hydrateAssetReferences(markdown: string, assets: MarkdownAsset[]) {
  if (!markdown.includes("marcato-asset:") || assets.length === 0) return markdown;
  const sources = new Map(assets.filter((asset) => asset.provider === "local").map((asset) => [asset.id, asset.source]));
  return markdown.replace(ASSET_REFERENCE_PATTERN, (match, id: string) => sources.get(id) || match);
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

function localFilePaths(file: File) {
  const paths = new Set<string>();
  const relativePath = normalizeLocalPath(file.webkitRelativePath || "");
  const name = normalizeLocalPath(file.name);
  if (relativePath) {
    paths.add(relativePath);
    const segments = relativePath.split("/");
    if (segments.length > 1) paths.add(segments.slice(1).join("/"));
  }
  if (name) paths.add(name);
  return [...paths];
}

function addUniqueCandidate(map: Map<string, LocalAssetCandidate | null>, rawPath: string, candidate: LocalAssetCandidate) {
  const path = normalizeLocalPath(rawPath);
  if (!path) return;
  const existing = map.get(path);
  if (existing && existing.asset.id !== candidate.asset.id) map.set(path, null);
  else if (existing === undefined) map.set(path, candidate);
}

function normalizeLocalPath(value: string) {
  const withoutAngles = unwrapAngleBrackets(value).split(/[?#]/, 1)[0].replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  try {
    return collapseLocalPath(decodeURIComponent(withoutAngles)).toLowerCase();
  } catch {
    return collapseLocalPath(withoutAngles).toLowerCase();
  }
}

function collapseLocalPath(value: string) {
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function normalizeReferenceId(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function unwrapAngleBrackets(value: string) {
  return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

function fileName(value: string) {
  return normalizeLocalPath(value).split("/").pop() || "";
}

function imageMimeType(file: File) {
  if (file.type.startsWith("image/")) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return ({
    avif: "image/avif",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  } as Record<string, string>)[extension] || "";
}

function readAsDataUrl(file: File, type = file.type || "image/png") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read image file")));
    reader.readAsDataURL(file.type ? file : new Blob([file], { type }));
  });
}
