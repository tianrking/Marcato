export function getExportName(title: string) {
  const withoutMarkdownExtension = (title || "document").replace(/\.(?:md|markdown|txt)$/i, "");
  const normalized = withoutMarkdownExtension
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "document";
}
