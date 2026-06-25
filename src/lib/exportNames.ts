export function getExportName(title: string) {
  return (title || "document").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").toLowerCase();
}
