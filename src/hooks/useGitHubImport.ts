import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchMarkdownFile, importFromGitHubUrl } from "../lib/githubImport";
import type { GitHubMarkdownFile } from "../types";

interface UseGitHubImportOptions {
  newTab: (content?: string, title?: string) => void;
  showToast: (message: string) => void;
}

export function useGitHubImport({ newTab, showToast }: UseGitHubImportOptions) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<GitHubMarkdownFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [listing, setListing] = useState(false);

  const openImport = () => {
    setFiles([]);
    setSelectedPaths(new Set());
    setError("");
    setOpen(true);
  };

  const listFiles = async () => {
    setListing(true);
    setError("");
    try {
      const nextFiles = await importFromGitHubUrl(url);
      setFiles(nextFiles);
      setSelectedPaths(new Set(nextFiles.length === 1 ? [nextFiles[0].path] : nextFiles.map((file) => file.path)));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.githubImportFailed");
      setError(message);
      showToast(message);
    } finally {
      setListing(false);
    }
  };

  const importSelection = async () => {
    setImporting(true);
    setError("");
    const selectedFiles = files.filter((file) => selectedPaths.has(file.path));
    try {
      for (const file of selectedFiles) {
        const content = await fetchMarkdownFile(file);
        newTab(content, file.name);
        await delay(120);
      }
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.githubImportFailed");
      setError(message);
      showToast(message);
    } finally {
      setImporting(false);
    }
  };

  return {
    modalProps: {
      files,
      error,
      importing,
      listing,
      onClose: () => setOpen(false),
      onImport: importSelection,
      onListFiles: listFiles,
      onSelectedPathsChange: setSelectedPaths,
      onUrlChange: setUrl,
      selectedPaths,
      url,
    },
    open: openImport,
    opened: open,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
