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

  const openImport = () => {
    setFiles([]);
    setSelectedPaths(new Set());
    setOpen(true);
  };

  const listFiles = async () => {
    try {
      const nextFiles = await importFromGitHubUrl(url);
      setFiles(nextFiles);
      setSelectedPaths(new Set(nextFiles.length === 1 ? [nextFiles[0].path] : nextFiles.map((file) => file.path)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("error.githubImportFailed"));
    }
  };

  const importSelection = async () => {
    const selectedFiles = files.filter((file) => selectedPaths.has(file.path));
    for (const file of selectedFiles) {
      const content = await fetchMarkdownFile(file);
      newTab(content, file.name);
      await delay(120);
    }
    setOpen(false);
  };

  return {
    modalProps: {
      files,
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
