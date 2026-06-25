import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitHubMarkdownFile } from "../types";
import { Modal } from "./Common";

interface GitHubImportModalProps {
  url: string;
  files: GitHubMarkdownFile[];
  selectedPaths: Set<string>;
  onUrlChange: (url: string) => void;
  onListFiles: () => void;
  onSelectedPathsChange: (paths: Set<string>) => void;
  onImport: () => void;
  onClose: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  file?: GitHubMarkdownFile;
  children: Map<string, TreeNode>;
}

export function GitHubImportModal({
  url,
  files,
  selectedPaths,
  onUrlChange,
  onListFiles,
  onSelectedPathsChange,
  onImport,
  onClose,
}: GitHubImportModalProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(files), [files]);
  const visibleFiles = useMemo(() => filterFiles(files, filter), [files, filter]);
  const selectedVisibleCount = visibleFiles.filter((file) => selectedPaths.has(file.path)).length;
  const selectedSize = files.reduce((total, file) => total + (selectedPaths.has(file.path) ? file.size : 0), 0);

  useEffect(() => {
    setExpandedPaths(new Set(collectDirectoryPaths(tree)));
  }, [tree]);

  const toggleFile = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onSelectedPathsChange(next);
  };

  const toggleDirectory = (node: TreeNode) => {
    const descendants = collectFilePaths(node);
    const allSelected = descendants.every((path) => selectedPaths.has(path));
    const next = new Set(selectedPaths);
    descendants.forEach((path) => {
      if (allSelected) next.delete(path);
      else next.add(path);
    });
    onSelectedPathsChange(next);
  };

  const toggleExpanded = (path: string) => {
    const next = new Set(expandedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedPaths(next);
  };

  const selectVisible = () => {
    const next = new Set(selectedPaths);
    visibleFiles.forEach((file) => next.add(file.path));
    onSelectedPathsChange(next);
  };

  return (
    <Modal title={t("github.importTitle")} onClose={onClose}>
      <div className="github-import">
        <div className="github-url-row">
          <input value={url} placeholder={t("github.placeholder")} onChange={(event) => onUrlChange(event.target.value)} />
          <button onClick={onListFiles}>
            <Search size={15} />
            {t("github.listFiles")}
          </button>
        </div>
        <div className="github-tree-head">
          <label className="github-filter">
            <Search size={14} />
            <input
              value={filter}
              placeholder={t("github.filterFiles", { defaultValue: "Filter files" })}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <span>
            {t("github.selectedCount", {
              defaultValue: "{{selected}} / {{total}} selected",
              selected: selectedPaths.size,
              total: files.length,
            })}
          </span>
          <span>{formatBytes(selectedSize)}</span>
        </div>
        <div className="github-tree" role="tree">
          {files.length ? (
            renderTree(tree, {
              depth: 0,
              filter,
              expandedPaths,
              selectedPaths,
              onToggleFile: toggleFile,
              onToggleDirectory: toggleDirectory,
              onToggleExpanded: toggleExpanded,
            })
          ) : (
            <div className="github-empty">{t("github.empty", { defaultValue: "No files listed yet." })}</div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={selectVisible} disabled={!visibleFiles.length}>{t("github.selectVisible", { defaultValue: "Select visible" })}</button>
          <button onClick={() => onSelectedPathsChange(new Set())} disabled={!selectedPaths.size}>{t("github.clearSelection", { defaultValue: "Clear" })}</button>
          <button onClick={onImport} disabled={!selectedPaths.size}>
            {t("action.importSelected")} {selectedPaths.size ? `(${selectedPaths.size})` : ""}
          </button>
        </div>
        {filter && (
          <small className="github-tree-foot">
            {t("github.visibleCount", {
              defaultValue: "{{selected}} selected in {{visible}} visible files",
              selected: selectedVisibleCount,
              visible: visibleFiles.length,
            })}
          </small>
        )}
      </div>
    </Modal>
  );
}

function renderTree(
  node: TreeNode,
  context: {
    depth: number;
    filter: string;
    expandedPaths: Set<string>;
    selectedPaths: Set<string>;
    onToggleFile: (path: string) => void;
    onToggleDirectory: (node: TreeNode) => void;
    onToggleExpanded: (path: string) => void;
  },
) {
  return sortedChildren(node)
    .filter((child) => isVisible(child, context.filter))
    .map((child) =>
      child.type === "directory" ? (
        <DirectoryRow key={child.path} node={child} context={context} />
      ) : (
        <FileRow key={child.path} node={child} context={context} />
      ),
    );
}

function DirectoryRow({
  node,
  context,
}: {
  node: TreeNode;
  context: Parameters<typeof renderTree>[1];
}) {
  const expanded = context.expandedPaths.has(node.path);
  const descendants = collectFilePaths(node);
  const selectedCount = descendants.filter((path) => context.selectedPaths.has(path)).length;
  const allSelected = descendants.length > 0 && selectedCount === descendants.length;
  const mixed = selectedCount > 0 && selectedCount < descendants.length;

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className="github-tree-row directory" style={{ "--depth": context.depth } as CSSProperties}>
        <button className="tree-toggle" onClick={() => context.onToggleExpanded(node.path)} aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <MixedCheckbox checked={allSelected} mixed={mixed} onChange={() => context.onToggleDirectory(node)} />
        <Folder size={16} />
        <button className="tree-name" onClick={() => context.onToggleExpanded(node.path)}>{node.name}</button>
        <span>{selectedCount}/{descendants.length}</span>
      </div>
      {expanded && renderTree(node, { ...context, depth: context.depth + 1 })}
    </div>
  );
}

function FileRow({
  node,
  context,
}: {
  node: TreeNode;
  context: Parameters<typeof renderTree>[1];
}) {
  const file = node.file;
  if (!file) return null;
  return (
    <label className="github-tree-row file" style={{ "--depth": context.depth } as CSSProperties} role="treeitem">
      <span className="tree-toggle" />
      <input type="checkbox" checked={context.selectedPaths.has(file.path)} onChange={() => context.onToggleFile(file.path)} />
      <FileText size={15} />
      <span className="tree-name">{node.name}</span>
      <span>{formatBytes(file.size)}</span>
    </label>
  );
}

function MixedCheckbox({ checked, mixed, onChange }: { checked: boolean; mixed: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);

  return <input ref={ref} type="checkbox" checked={checked} aria-checked={mixed ? "mixed" : checked} onChange={onChange} />;
}

function buildTree(files: GitHubMarkdownFile[]) {
  const root: TreeNode = { name: "", path: "", type: "directory", children: new Map() };
  files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const type = index === parts.length - 1 ? "file" : "directory";
      const existing = cursor.children.get(part);
      if (existing) {
        cursor = existing;
        return;
      }
      const next: TreeNode = {
        name: part,
        path,
        type,
        file: type === "file" ? file : undefined,
        children: new Map(),
      };
      cursor.children.set(part, next);
      cursor = next;
    });
  });
  return root;
}

function sortedChildren(node: TreeNode) {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function isVisible(node: TreeNode, filter: string): boolean {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  if (node.type === "file") return node.path.toLowerCase().includes(query);
  return sortedChildren(node).some((child) => isVisible(child, filter));
}

function filterFiles(files: GitHubMarkdownFile[], filter: string) {
  const query = filter.trim().toLowerCase();
  if (!query) return files;
  return files.filter((file) => file.path.toLowerCase().includes(query));
}

function collectDirectoryPaths(node: TreeNode): string[] {
  return sortedChildren(node).flatMap((child) => {
    if (child.type === "file") return [];
    return [child.path, ...collectDirectoryPaths(child)];
  });
}

function collectFilePaths(node: TreeNode): string[] {
  if (node.type === "file") return node.file ? [node.file.path] : [];
  return sortedChildren(node).flatMap(collectFilePaths);
}

function formatBytes(size: number) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
