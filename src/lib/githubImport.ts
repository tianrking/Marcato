import type { GitHubMarkdownFile } from "../types";

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
  rawUrl?: string;
}

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
  const ref = parsed.ref || (await getDefaultBranch(parsed.owner, parsed.repo));
  const path = parsed.path || "";
  const entries = await listContents(parsed.owner, parsed.repo, ref, path);
  return entries.filter((entry) => isMarkdownPath(entry.path)).slice(0, 30);
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
    const ref = parts[3];
    const path = parts.slice(4).join("/");
    return { owner, repo, ref, path };
  }
  if (parts[2] === "tree") {
    const ref = parts[3];
    const path = parts.slice(4).join("/");
    return { owner, repo, ref, path };
  }
  return { owner, repo };
}

async function getDefaultBranch(owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!response.ok) throw new Error("Could not read repository metadata.");
  const json = await response.json();
  return json.default_branch || "main";
}

async function listContents(owner: string, repo: string, ref: string, path: string): Promise<GitHubMarkdownFile[]> {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Could not list GitHub contents.");
  const json = await response.json();
  const items = Array.isArray(json) ? json : [json];
  const results: GitHubMarkdownFile[] = [];
  for (const item of items) {
    if (item.type === "file" && isMarkdownPath(item.path) && item.download_url) {
      results.push({ path: item.path, name: item.name, downloadUrl: item.download_url, size: item.size || 0 });
    }
    if (item.type === "dir") {
      await delay(120);
      results.push(...(await listContents(owner, repo, ref, item.path)));
      if (results.length >= 30) break;
    }
  }
  return results;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
