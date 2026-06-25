import type { GitHubMarkdownFile } from "../types";

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  ref?: string;
  refPath?: string[];
  path?: string;
  rawUrl?: string;
}

const GITHUB_IMPORT_LIMIT = 100;

export function isMarkdownPath(path: string) {
  return /\.(md|markdown|mdown|mkdn)$/i.test(path);
}

export async function importFromGitHubUrl(url: string): Promise<GitHubMarkdownFile[]> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("Enter a public GitHub repo, tree, blob, or raw markdown URL.");
  if (parsed.rawUrl) {
    const name = parsed.rawUrl.split("/").pop() || "Imported.md";
    return [{ path: name, name, downloadUrl: parsed.rawUrl, size: 0 }];
  }
  const resolved = parsed.refPath
    ? await resolveRefPath(parsed.owner, parsed.repo, parsed.refPath)
    : { ref: parsed.ref || (await getDefaultBranch(parsed.owner, parsed.repo)), path: parsed.path || "" };
  const entries = await listContents(parsed.owner, parsed.repo, resolved.ref, resolved.path, GITHUB_IMPORT_LIMIT);
  return entries.filter((entry) => isMarkdownPath(entry.path)).slice(0, GITHUB_IMPORT_LIMIT);
}

export async function fetchMarkdownFile(file: GitHubMarkdownFile) {
  const response = await fetch(file.downloadUrl);
  if (!response.ok) throw new Error(`Unable to fetch ${file.path}`);
  return await response.text();
}

function parseGitHubUrl(value: string): ParsedGitHubUrl | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.hostname === "raw.githubusercontent.com") {
    return { owner: "", repo: "", rawUrl: url.toString() };
  }
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (parts[2] === "blob") {
    return { owner, repo, refPath: parts.slice(3) };
  }
  if (parts[2] === "tree") {
    return { owner, repo, refPath: parts.slice(3) };
  }
  return { owner, repo };
}

async function resolveRefPath(owner: string, repo: string, refPath: string[]) {
  if (!refPath.length) return { ref: await getDefaultBranch(owner, repo), path: "" };
  const branches = await listBranchNames(owner, repo);
  const branch = branches
    .sort((a, b) => b.length - a.length)
    .find((name) => refPath.join("/").startsWith(name) && (refPath.join("/") === name || refPath.join("/").startsWith(`${name}/`)));
  if (branch) {
    const path = refPath.join("/").slice(branch.length).replace(/^\//, "");
    return { ref: branch, path };
  }
  return { ref: refPath[0], path: refPath.slice(1).join("/") };
}

async function listBranchNames(owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`);
  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json) ? json.map((branch) => branch?.name).filter((name): name is string => typeof name === "string") : [];
}

async function getDefaultBranch(owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!response.ok) throw new Error("Could not read repository metadata.");
  const json = await response.json();
  return json.default_branch || "main";
}

async function listContents(owner: string, repo: string, ref: string, path: string, limit: number): Promise<GitHubMarkdownFile[]> {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Could not list GitHub contents.");
  const json = await response.json();
  const items = Array.isArray(json) ? json : [json];
  const results: GitHubMarkdownFile[] = [];
  for (const item of items) {
    if (results.length >= limit) break;
    if (item.type === "file" && isMarkdownPath(item.path) && item.download_url) {
      results.push({ path: item.path, name: item.name, downloadUrl: item.download_url, size: item.size || 0 });
    }
    if (item.type === "dir") {
      await delay(120);
      results.push(...(await listContents(owner, repo, ref, item.path, limit - results.length)));
    }
  }
  return results;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
