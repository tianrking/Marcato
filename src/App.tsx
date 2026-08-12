import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ALargeSmall,
  BadgeAlert,
  BadgeCent,
  BookMarked,
  Bold,
  Braces,
  CalendarClock,
  CaseLower,
  CaseUpper,
  Code2,
  Eye,
  FilePlus2,
  Heading4,
  Heading5,
  Heading6,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Images,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Play,
  Redo2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
  Smile,
  Strikethrough,
  Table2,
  Maximize2,
  Minus,
  Terminal,
  Trash2,
  TextQuote,
  Undo2,
} from "lucide-react";
import { AppHeader } from "./components/AppHeader";
import { AssetLibraryPanel } from "./components/AssetLibraryPanel";
import { ConfirmModal } from "./components/ConfirmModal";
import { DocumentLibraryPanel } from "./components/DocumentLibraryPanel";
import { DocumentHealthModal } from "./components/DocumentHealthModal";
import { EasterEggLayer } from "./components/EasterEggLayer";
import { ExternalAskMenu } from "./components/ExternalAskMenu";
import { FindReplacePanel } from "./components/FindReplacePanel";
import { IconButton } from "./components/Common";
import { GitHubImportModal } from "./components/GitHubImportModal";
import { InsertModalHost } from "./components/InsertModalHost";
import { MobileMenu } from "./components/MobileMenu";
import { PreviewPane } from "./components/PreviewPane";
import { ProfessionalProfilePanel } from "./components/ProfessionalProfilePanel";
import { ReplacePreviewModal } from "./components/ReplacePreviewModal";
import { ShareModal } from "./components/ShareModal";
import { TabStrip } from "./components/TabStrip";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { WechatExportModal } from "./components/WechatExportModal";
import { WechatModeBar } from "./components/WechatModeBar";
import { useFindReplace } from "./hooks/useFindReplace";
import { useGitHubImport } from "./hooks/useGitHubImport";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useInsertModals } from "./hooks/useInsertModals";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { useShare } from "./hooks/useShare";
import { MAX_ASSETS, MAX_IMPORT_BYTES, MAX_TABS } from "./lib/constants";
import {
  assetMarkdown,
  assetReference,
  collectAssetReferenceIds,
  createLocalAsset,
  createLocalAssetCandidate,
  createRemoteAsset,
  embedLocalImagesInMarkdown,
  hydrateAssetReferences,
  loadAssets,
  saveAssets,
  selectAssetsForStorage,
} from "./lib/assets";
import { applyCommand, handleSmartEnter, type MarkdownCommand } from "./lib/editorCommands";
import { buildExternalAskPrompt, buildExternalAskUrl, type ExternalAskTarget } from "./lib/externalAsk";
import { assertPreviewRevision, exportHtml, exportMarkdown, waitForPreviewExportReady } from "./lib/downloads";
import { getExportName } from "./lib/exportNames";
import { analyzeDocumentHealth } from "./lib/documentHealth";
import { i18n } from "./lib/i18n";
import { analyzeProfessionalProfile } from "./lib/professionalProfiles";
import { scrollPreviewToAnchor } from "./lib/previewLinks";
import { type PreviewBlock } from "./lib/previewDocument";
import { makeTab, WORKSPACE_STORAGE_FAILURE_EVENT } from "./lib/storage";
import { copyWechatRichText } from "./lib/wechatExport";
import { useAppStore } from "./stores/appStore";
import type { PdfExportPhase } from "./lib/exporters";
import type { MarkdownAsset, MarkdownTab, ProfessionalProfile } from "./types";

interface PdfExportState {
  phase: PdfExportPhase | "cancelling";
  progress: number;
}

interface ConfirmAction {
  confirmLabel: string;
  danger?: boolean;
  message: string;
  onConfirm: () => void;
  title: string;
}

interface PreviewRevision {
  content: string;
  professionalProfile: ProfessionalProfile;
  tabId: string;
}

interface WechatExportSnapshot {
  fallbackTitle: string;
  source: HTMLElement;
}

type HeavyExporters = typeof import("./lib/exporters");

let heavyExportersPromise: Promise<HeavyExporters> | null = null;

function loadHeavyExporters() {
  heavyExportersPromise ||= import("./lib/exporters").catch((error) => {
    heavyExportersPromise = null;
    throw error;
  });
  return heavyExportersPromise;
}

const PDF_EXPORT_LABEL_KEYS: Record<PdfExportState["phase"], string> = {
  preparing: "export.pdfPreparing",
  rendering: "export.pdfRendering",
  paginating: "export.pdfPaginating",
  saving: "export.pdfSaving",
  cancelling: "export.pdfCancelling",
};

function App() {
  const { t } = useTranslation();
  const globalState = useAppStore((state) => state.globalState);
  const tabs = useAppStore((state) => state.tabs);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const shareMode = useAppStore((state) => state.shareMode);
  const initializeWorkspace = useAppStore((state) => state.initializeWorkspace);
  const updateGlobal = useAppStore((state) => state.updateGlobal);
  const setActiveTabId = useAppStore((state) => state.setActiveTabId);
  const updateActiveContent = useAppStore((state) => state.updateActiveContent);
  const addTab = useAppStore((state) => state.addTab);
  const addTabs = useAppStore((state) => state.addTabs);
  const closeStoreTab = useAppStore((state) => state.closeTab);
  const renameStoreTab = useAppStore((state) => state.renameTab);
  const duplicateStoreTab = useAppStore((state) => state.duplicateTab);
  const reorderStoreTab = useAppStore((state) => state.reorderTab);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const readOnly = shareMode === "view";
  const viewMode = readOnly ? "preview" : globalState.viewMode;
  const [selectedPreviewBlockId, setSelectedPreviewBlockId] = useState("");
  const [toast, setToast] = useState("");
  const [documentLibraryOpen, setDocumentLibraryOpen] = useState(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [assets, setAssets] = useState<MarkdownAsset[]>(() => loadAssets());
  const [externalAsk, setExternalAsk] = useState<{ selection: string; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editorImageDragging, setEditorImageDragging] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pdfExport, setPdfExport] = useState<PdfExportState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [wechatExportSnapshot, setWechatExportSnapshot] = useState<WechatExportSnapshot | null>(null);
  const [wechatCopying, setWechatCopying] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const wechatExportSnapshotRef = useRef<HTMLElement | null>(null);
  const syncingRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  );
  const text = activeTab?.content || "";
  const hydratedText = useMemo(() => hydrateAssetReferences(text, assets), [assets, text]);
  const renderTab = useMemo(
    () => activeTab && hydratedText !== text ? { ...activeTab, content: hydratedText } : activeTab,
    [activeTab, hydratedText, text],
  );
  const {
    document: previewDocument,
    toc,
    state: renderState,
    error: renderError,
    ready: renderReady,
    revisionToken,
  } = useMarkdownRender(renderTab, globalState.professionalProfile);
  const previewRevision: PreviewRevision = {
    content: hydratedText,
    professionalProfile: globalState.professionalProfile,
    tabId: renderTab?.id || "",
  };
  const renderReadinessRef = useRef({
    error: renderError,
    ready: renderReady,
    revision: previewRevision,
    revisionToken,
    state: renderState,
  });
  renderReadinessRef.current = {
    error: renderError,
    ready: renderReady,
    revision: previewRevision,
    revisionToken,
    state: renderState,
  };
  const commitContent = useCallback((content: string) => updateActiveContent(content, true), [updateActiveContent]);
  const findReplace = useFindReplace(text, editorRef, commitContent);
  const insertModals = useInsertModals({ activeTab, commitContent, editorRef, text });
  const share = useShare(hydratedText, showToast);
  const stats = useMemo(() => getStats(text), [text]);
  const health = useMemo(() => analyzeDocumentHealth(text), [text]);
  const professionalReport = useMemo(() => analyzeProfessionalProfile(text, globalState.professionalProfile), [text, globalState.professionalProfile]);
  const liveMessage = toast ||
    (pdfExport ? `${t(PDF_EXPORT_LABEL_KEYS[pdfExport.phase], { defaultValue: pdfExport.phase })} ${Math.round(pdfExport.progress * 100)}%` : "") ||
    renderError ||
    (renderState === "rendering" ? t("status.rendering") : "");

  useEffect(() => {
    document.documentElement.dataset.theme = globalState.theme;
    document.documentElement.dataset.accent = globalState.accent;
    document.documentElement.dataset.easterEggs = globalState.easterEggs ? "on" : "off";
    document.documentElement.dataset.professionalProfile = globalState.professionalProfile;
    document.documentElement.lang = globalState.language === "zh" ? "zh-Hans" : globalState.language === "tw" ? "zh-Hant" : globalState.language;
    document.body.dir = globalState.direction;
    void i18n.changeLanguage(globalState.language);
  }, [globalState]);

  useEffect(() => {
    const notifyPersistenceFailure = () => {
      showToast("Changes are kept in this tab, but browser storage is unavailable or full. Export your Markdown to avoid data loss after reload.");
    };
    window.addEventListener(WORKSPACE_STORAGE_FAILURE_EVENT, notifyPersistenceFailure);
    return () => window.removeEventListener(WORKSPACE_STORAGE_FAILURE_EVENT, notifyPersistenceFailure);
  }, []);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  useEffect(() => {
    const reloadForShareNavigation = (event: HashChangeEvent) => {
      const oldHash = new URL(event.oldURL).hash;
      const newHash = new URL(event.newURL).hash;
      if (oldHash.startsWith("#share=") || newHash.startsWith("#share=")) window.location.reload();
    };
    window.addEventListener("hashchange", reloadForShareNavigation);
    return () => window.removeEventListener("hashchange", reloadForShareNavigation);
  }, []);

  useEffect(() => {
    bundleInputRef.current?.setAttribute("webkitdirectory", "");
    bundleInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      pdfAbortRef.current?.abort();
      wechatExportSnapshotRef.current?.remove();
      wechatExportSnapshotRef.current = null;
    };
  }, []);

  const closeWechatExport = useCallback(() => {
    wechatExportSnapshotRef.current?.remove();
    wechatExportSnapshotRef.current = null;
    setWechatExportSnapshot(null);
  }, []);

  const runCommand = (command: MarkdownCommand) => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const result = applyCommand(activeTab.content, command, editor.selectionStart, editor.selectionEnd);
    // A toolbar click moves focus away from the textarea before onClick runs.
    // Restore it synchronously so an immediate undo/redo shortcut is not lost
    // while React is committing the controlled value. The next frame still
    // reapplies the command's final selection after the DOM value has updated.
    editor.focus();
    commitContent(result.value);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
    });
  };

  const newTab = useCallback((content = "", title?: string) => {
    const tab = addTab(content, title);
    if (!tab) showToast(`Tab limit is ${MAX_TABS}.`);
  }, [addTab]);
  const githubImport = useGitHubImport({ newTab, showToast });

  const closeTab = useCallback((id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (tab?.content.trim()) {
      setConfirmAction({
        title: "Close tab",
        message: `Close "${tab.title}"? Unsaved local changes in this tab will be removed from the workspace.`,
        confirmLabel: "Close tab",
        danger: true,
        onConfirm: () => {
          closeStoreTab(id, "");
          setConfirmAction(null);
        },
      });
      return;
    }
    closeStoreTab(id, "");
  }, [closeStoreTab, tabs]);

  const duplicateTab = (id: string) => {
    const tab = duplicateStoreTab(id);
    if (!tab) showToast(`Tab limit is ${MAX_TABS}.`);
  };

  useGlobalShortcuts({
    activeTabId,
    disabled: Boolean(wechatExportSnapshot),
    editorRef,
    onCloseTab: readOnly ? () => {} : closeTab,
    onNewTab: readOnly ? () => {} : () => newTab(),
    onOpenFind: readOnly ? () => {} : () => findReplace.setOpen(true),
    onRedo: redo,
    onSave: () => {
      exportMarkdown(getExportName(activeTab?.title || "document"), hydratedText);
    },
    onToggleSyncScroll: () => updateGlobal({ syncScroll: !globalState.syncScroll }),
    onUndo: undo,
  });

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const editor = event.currentTarget;
      const result = {
        value: text.slice(0, editor.selectionStart) + "  " + text.slice(editor.selectionEnd),
        start: editor.selectionStart + 2,
        end: editor.selectionStart + 2,
      };
      commitContent(result.value);
      requestAnimationFrame(() => editor.setSelectionRange(result.start, result.end));
    }
    if (event.key === "Enter") {
      const editor = event.currentTarget;
      const result = handleSmartEnter(text, editor.selectionStart);
      if (result) {
        event.preventDefault();
        commitContent(result.value);
        requestAnimationFrame(() => editor.setSelectionRange(result.start, result.end));
      }
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles: File[] = [];
    const markdownFiles: File[] = [];
    for (const file of [...files]) {
      if (isImageFile(file)) {
        imageFiles.push(file);
        continue;
      }
      if (!/\.(md|markdown|txt)$/i.test(file.name)) continue;
      if (file.size > MAX_IMPORT_BYTES) {
        showToast(`${file.name} is over 10 MB.`);
        continue;
      }
      markdownFiles.push(file);
    }

    const imageCandidates = [];
    for (const file of imageFiles) {
      try {
        imageCandidates.push(await createLocalAssetCandidate(file));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not add image asset.");
      }
    }

    const readableMarkdown: Array<{ content: string; file: File }> = [];
    const bundledAssetIds = new Set<string>();
    for (const file of markdownFiles) {
      const content = await file.text();
      if (hasBinaryBytes(content)) {
        showToast(`${file.name} looks binary and was skipped.`);
        continue;
      }
      const analyzed = embedLocalImagesInMarkdown(content, imageCandidates, file.webkitRelativePath || file.name);
      for (const id of analyzed.usedAssetIds) bundledAssetIds.add(id);
      readableMarkdown.push({ content, file });
    }

    const reusableAssets = imageCandidates.map((candidate) => candidate.asset);
    const storedAssets = reusableAssets.length
      ? commitAssets([...reusableAssets, ...assets], bundledAssetIds)
      : assets;
    const storedIds = new Set((storedAssets || []).map((asset) => asset.id));
    const retainedCandidates = storedAssets
      ? imageCandidates.filter((candidate) => storedIds.has(candidate.asset.id))
      : [];
    const imported: MarkdownTab[] = [];
    let embeddedCount = 0;
    for (const { content, file } of readableMarkdown) {
      const bundled = embedLocalImagesInMarkdown(content, retainedCandidates, file.webkitRelativePath || file.name);
      embeddedCount += bundled.embeddedCount;
      imported.push(makeTab(file.name, bundled.markdown));
    }

    const addedAssetCount = retainedCandidates.length;
    const skippedAssetCount = reusableAssets.length - addedAssetCount;
    if (imported.length) {
      addTabs(imported, imported[0].id);
      if (!storedAssets && reusableAssets.length) {
        showToast("Documents imported, but image assets could not be saved. Browser storage may be full; local image paths were kept.");
      } else if (skippedAssetCount > 0) {
        showToast(`${imported.length} document${imported.length > 1 ? "s" : ""} imported with ${embeddedCount} embedded image reference${embeddedCount === 1 ? "" : "s"}; ${skippedAssetCount} image asset${skippedAssetCount === 1 ? " was" : "s were"} skipped at the ${MAX_ASSETS}-asset limit.`);
      } else if (embeddedCount > 0) {
        showToast(t("toast.bundleImported", { documents: imported.length, images: embeddedCount }));
      }
    } else if (reusableAssets.length) {
      if (!storedAssets) {
        showToast("Could not save image assets. Browser storage may be full; nothing was added.");
      } else {
        showToast(`${addedAssetCount} image asset${addedAssetCount === 1 ? "" : "s"} added${skippedAssetCount ? `; ${skippedAssetCount} skipped at the ${MAX_ASSETS}-asset limit` : ""}.`);
      }
    }
  };

  const commitAssets = (nextAssets: MarkdownAsset[], preferredAssetIds: Iterable<string> = []) => {
    const referencedAssetIds = collectAssetReferenceIds(tabs.map((tab) => tab.content));
    const limited = selectAssetsForStorage(nextAssets, [...referencedAssetIds, ...preferredAssetIds]);
    if (shareMode === "view") return null;
    if (!shareMode && !saveAssets(limited)) return null;
    setAssets(limited);
    return limited;
  };

  const addLocalAssets = async (files: FileList | File[], insert = false, range?: { start: number; end: number }) => {
    const created: MarkdownAsset[] = [];
    for (const file of [...files]) {
      try {
        created.push(await createLocalAsset(file));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not add image asset.");
      }
    }
    if (!created.length) return;
    const storedAssets = commitAssets([...created, ...assets], created.map((asset) => asset.id));
    if (!storedAssets) {
      showToast("Could not save image assets. Browser storage may be full; nothing was inserted.");
      return;
    }
    const storedIds = new Set(storedAssets.map((asset) => asset.id));
    const retained = created.filter((asset) => storedIds.has(asset.id));
    const skippedCount = created.length - retained.length;
    if (insert) insertAssetMarkdown(retained, range);
    if (!retained.length) {
      showToast(`Asset limit is ${MAX_ASSETS}. No images were added or inserted.`);
    } else if (skippedCount > 0) {
      showToast(`${retained.length} image${retained.length === 1 ? "" : "s"} ${insert ? "inserted" : "added"}; ${skippedCount} skipped at the ${MAX_ASSETS}-asset limit.`);
    } else {
      showToast(insert
        ? t("toast.imagesInserted", { count: retained.length })
        : `${retained.length} image asset${retained.length > 1 ? "s" : ""} added.`);
    }
  };

  const addRemoteAsset = (name: string, source: string) => {
    try {
      const asset = createRemoteAsset(name, source);
      const storedAssets = commitAssets([asset, ...assets], [asset.id]);
      if (!storedAssets) {
        showToast("Could not save the remote image. Browser storage may be full.");
        return false;
      }
      if (!storedAssets.some((stored) => stored.id === asset.id)) {
        showToast(`Asset limit is ${MAX_ASSETS}. The remote image was not registered.`);
        return false;
      }
      showToast("Remote image registered.");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not register image URL.");
      return false;
    }
  };

  const removeAsset = (id: string) => {
    if (collectAssetReferenceIds(tabs.map((tab) => tab.content)).has(id)) {
      showToast("This image is still referenced by a document. Remove its Markdown references before deleting the asset.");
      return;
    }
    if (!commitAssets(assets.filter((asset) => asset.id !== id))) {
      showToast("Could not update image assets. Browser storage may be full; nothing was removed.");
    }
  };

  const insertAssetMarkdown = (selectedAssets: MarkdownAsset[], range?: { start: number; end: number }) => {
    if (!activeTab || selectedAssets.length === 0) return;
    const editor = editorRef.current;
    const start = range?.start ?? editor?.selectionStart ?? activeTab.content.length;
    const end = range?.end ?? editor?.selectionEnd ?? start;
    const insertion = buildAssetBlockInsertion(activeTab.content, start, end, selectedAssets);
    const next = activeTab.content.slice(0, start) + insertion + activeTab.content.slice(end);
    commitContent(next);
    requestAnimationFrame(() => {
      if (!editor) return;
      const caret = start + insertion.length;
      editor.focus();
      editor.setSelectionRange(caret, caret);
    });
  };

  const copyAssetSource = async (asset: MarkdownAsset) => {
    await navigator.clipboard.writeText(assetReference(asset));
    showToast("Asset reference copied.");
  };

  const onEditorPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter(isImageFile);
    if (!imageFiles.length) return;
    event.preventDefault();
    const editor = event.currentTarget;
    void addLocalAssets(imageFiles, true, { start: editor.selectionStart, end: editor.selectionEnd });
  };

  const onEditorDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragging(false);
    setEditorImageDragging(true);
  };

  const onEditorDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setEditorImageDragging(false);
  };

  const onEditorDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile);
    if (!imageFiles.length) return;
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    setEditorImageDragging(false);
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? text.length;
    const end = editor?.selectionEnd ?? start;
    void addLocalAssets(imageFiles, true, { start, end });
  };

  const openExternalAskMenu = (event: MouseEvent<HTMLElement>, selection: string) => {
    if (!selection.trim()) return;
    event.preventDefault();
    const menuWidth = 280;
    const menuHeight = 330;
    setExternalAsk({
      selection,
      x: Math.min(event.clientX, Math.max(12, window.innerWidth - menuWidth - 12)),
      y: Math.min(event.clientY, Math.max(12, window.innerHeight - menuHeight - 12)),
    });
  };

  const onEditorContextMenu = (event: MouseEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget;
    const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd) || currentLineAt(editor.value, editor.selectionStart);
    openExternalAskMenu(event, selection);
  };

  const onPreviewContextMenu = (event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection()?.toString() || "";
    openExternalAskMenu(event, selection);
  };

  const currentAskPrompt = () => buildExternalAskPrompt(externalAsk?.selection || "", activeTab?.title || "Untitled", globalState.professionalProfile);

  const openExternalAsk = (target: ExternalAskTarget) => {
    const url = buildExternalAskUrl(target, currentAskPrompt());
    window.open(url, "_blank", "noopener,noreferrer");
    setExternalAsk(null);
  };

  const copyExternalAskPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentAskPrompt());
      showToast("External prompt copied.");
    } catch {
      showToast("Clipboard unavailable for external prompt.");
    }
    setExternalAsk(null);
  };

  const doCopyMarkdown = async () => {
    await navigator.clipboard.writeText(hydratedText);
    showToast(t("toast.markdownCopied"));
  };

  const exportMarkdownFile = async () => {
    exportMarkdown(getExportName(activeTab?.title || "document"), hydratedText);
  };

  const exportHtmlFile = async () => {
    try {
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, previewRevision);
      if (!previewRef.current) return;
      await exportHtml(
        getExportName(activeTab?.title || "document"),
        previewRef.current,
        activeTab?.title || t("status.document"),
        expectedRevisionToken,
      );
    } catch {
      showToast(t("toast.exportFailed", { defaultValue: "Export failed. Please reload and try again." }));
    }
  };

  const exportPreviewPng = async () => {
    if (!previewRef.current) return;
    try {
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, previewRevision);
      if (!previewRef.current) return;
      const { exportPng } = await loadHeavyExporters();
      await exportPng(getExportName(activeTab?.title || "document"), previewRef.current, expectedRevisionToken);
    } catch {
      showToast(t("toast.exportFailed", { defaultValue: "Export failed. Please reload and try again." }));
    }
  };

  const doCopyPreviewImage = async () => {
    if (!previewRef.current) return;
    try {
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, previewRevision);
      if (!previewRef.current) return;
      const { copyImage } = await loadHeavyExporters();
      const result = await copyImage(
        previewRef.current,
        getExportName(activeTab?.title || "document"),
        expectedRevisionToken,
      );
      showToast(
        result === "copied"
          ? t("toast.previewImageCopied")
          : result === "downloaded"
            ? t("toast.previewImageDownloaded", { defaultValue: "Clipboard unavailable, PNG downloaded." })
            : t("toast.clipboardImageUnavailable"),
      );
    } catch {
      showToast(t("toast.exportFailed", { defaultValue: "Export failed. Please reload and try again." }));
    }
  };

  const doCopyWechat = async () => {
    const expectedRevision: PreviewRevision = { ...previewRevision, professionalProfile: "wechat" };
    try {
      if (globalState.professionalProfile !== "wechat") updateGlobal({ professionalProfile: "wechat" });
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, expectedRevision);
      if (!previewRef.current) return;
      await waitForPreviewExportReady(previewRef.current, 15_000, expectedRevisionToken);
      const snapshot = createConnectedWechatSnapshot(previewRef.current, expectedRevisionToken);
      wechatExportSnapshotRef.current?.remove();
      wechatExportSnapshotRef.current = snapshot;
      setWechatExportSnapshot({
        fallbackTitle: activeTab?.title || t("status.untitled"),
        source: snapshot,
      });
    } catch {
      showToast(t("toast.wechatCopyFailed"));
    }
  };

  const doQuickCopyWechat = async () => {
    if (!previewRef.current || wechatCopying) return;
    setWechatCopying(true);
    let snapshot: HTMLElement | null = null;
    try {
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, previewRevision);
      if (!previewRef.current) return;
      await waitForPreviewExportReady(previewRef.current, 15_000, expectedRevisionToken);
      snapshot = createConnectedWechatSnapshot(previewRef.current, expectedRevisionToken);
      const result = await copyWechatRichText(snapshot, { excludeTitle: true, style: globalState.wechatStyle });
      const message = result.method === "plain-text"
        ? t("toast.wechatCopiedPlain")
        : t("toast.wechatCopied", {
            direct: result.stats.embeddedImages + result.stats.preservedWechatImages,
            images: result.stats.imagePlaceholders,
            diagrams: result.stats.diagrams,
          });
      showToast(message);
    } catch {
      showToast(t("toast.wechatCopyFailed"));
    } finally {
      snapshot?.remove();
      setWechatCopying(false);
    }
  };

  const doExportPdf = async () => {
    if (!previewRef.current || pdfAbortRef.current) return;
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    setPdfExport({ phase: "preparing", progress: 0.04 });
    try {
      const expectedRevisionToken = await waitForLatestPreviewRender(renderReadinessRef, previewRevision);
      if (!previewRef.current) return;
      const { exportPdf } = await loadHeavyExporters();
      await exportPdf(getExportName(activeTab?.title || "document"), previewRef.current, {
        signal: controller.signal,
        onProgress: ({ phase, progress }) => setPdfExport({ phase, progress }),
      }, expectedRevisionToken);
      showToast(t("toast.pdfSaved", { defaultValue: "PDF exported." }));
    } catch (error) {
      if (isAbortError(error)) showToast(t("toast.pdfCancelled", { defaultValue: "PDF export cancelled." }));
      else showToast(t("toast.pdfFailed", { defaultValue: "PDF export failed. Please try again." }));
    } finally {
      if (pdfAbortRef.current === controller) pdfAbortRef.current = null;
      setPdfExport(null);
    }
  };

  const cancelPdfExport = () => {
    pdfAbortRef.current?.abort();
    setPdfExport((current) => current ? { ...current, phase: "cancelling" } : current);
  };

  const requestClearDocument = () => {
    if (!text.trim()) return;
    setConfirmAction({
      title: "Clear document",
      message: "Clear the current document? This removes the text from the active tab.",
      confirmLabel: "Clear document",
      danger: true,
      onConfirm: () => {
        commitContent("");
        setConfirmAction(null);
      },
    });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      showToast("Fullscreen is unavailable in this browser.");
    }
  };

  const selectPreviewBlock = useCallback((block: PreviewBlock) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = lineRangeToOffsets(text, block.startLine, block.endLine);
    setSelectedPreviewBlockId(block.id);
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, (block.startLine - 1) * lineHeight - 80);
  }, [text]);

  const jumpToLine = useCallback((line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = lineRangeToOffsets(text, line, line);
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, (line - 1) * lineHeight - 80);
  }, [text]);

  const onScrollEditor = () => {
    if (!globalState.syncScroll || syncingRef.current || !editorRef.current || !previewPaneRef.current) return;
    syncingRef.current = true;
    const editor = editorRef.current;
    const ratio = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
    previewPaneRef.current.scrollTop = ratio * (previewPaneRef.current.scrollHeight - previewPaneRef.current.clientHeight);
    window.setTimeout(() => (syncingRef.current = false), 40);
  };

  const onScrollPreview = () => {
    if (!globalState.syncScroll || syncingRef.current || !editorRef.current || !previewPaneRef.current) return;
    syncingRef.current = true;
    const pane = previewPaneRef.current;
    const ratio = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight);
    editorRef.current.scrollTop = ratio * (editorRef.current.scrollHeight - editorRef.current.clientHeight);
    window.setTimeout(() => (syncingRef.current = false), 40);
  };

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startPercent = globalState.splitPercent;
    const onMove = (move: PointerEvent) => {
      const width = window.innerWidth || 1;
      const delta = ((move.clientX - startX) / width) * 100;
      updateGlobal({ splitPercent: Math.min(80, Math.max(20, startPercent + delta)) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 2600);
  }

  return (
    <div
      className={`app-shell view-${viewMode}`}
      data-share-mode={shareMode || undefined}
      onDragOver={(event) => {
        if (!hasFileTransfer(event.dataTransfer)) return;
        event.preventDefault();
        if (!readOnly) setDragging(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        if (readOnly) return;
        void handleFiles(event.dataTransfer.files);
      }}
    >
      <EasterEggLayer enabled={globalState.easterEggs} />
      <AppHeader
        accent={globalState.accent}
        easterEggs={globalState.easterEggs}
        stats={stats}
        theme={globalState.theme}
        viewMode={viewMode}
        readOnly={readOnly}
        onAccentChange={(accent) => updateGlobal({ accent })}
        onEasterEggsChange={(easterEggs) => updateGlobal({ easterEggs })}
        onOpenDocumentLibrary={() => setDocumentLibraryOpen(true)}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onThemeChange={(theme) => updateGlobal({ theme })}
        onViewModeChange={(viewMode) => updateGlobal({ viewMode })}
      />

      <WorkspaceToolbar
        fileInputRef={fileInputRef}
        bundleInputRef={bundleInputRef}
        globalState={globalState}
        onGlobalChange={updateGlobal}
        onNewTab={() => newTab("", undefined)}
        onGithubImport={githubImport.open}
        onFilesSelected={(files) => void handleFiles(files)}
        onBundleSelected={(files) => void handleFiles(files)}
        onExportMarkdown={() => void exportMarkdownFile()}
        onExportHtml={() => void exportHtmlFile()}
        onExportPdf={() => void doExportPdf()}
        onExportPng={() => previewRef.current && void exportPreviewPng()}
        onCopyMarkdown={doCopyMarkdown}
        onCopyWechat={() => void doCopyWechat()}
        onCopyPreviewImage={doCopyPreviewImage}
        onShare={() => share.open("view")}
        readOnly={readOnly}
      />

      <TabStrip
        activeTabId={activeTabId}
        tabs={tabs}
        onCloseTab={closeTab}
        onNewTab={() => newTab("", undefined)}
        onRenameTab={renameStoreTab}
        onReorderTab={reorderStoreTab}
        onSelectTab={setActiveTabId}
        readOnly={readOnly}
      />

      {!readOnly && (
        <DocumentLibraryPanel
          activeTabId={activeTabId}
          opened={documentLibraryOpen}
          tabs={tabs}
          onClose={() => setDocumentLibraryOpen(false)}
          onCloseTab={closeTab}
          onDuplicateTab={duplicateTab}
          onGithubImport={githubImport.open}
          onImportFiles={() => fileInputRef.current?.click()}
          onNewTab={() => newTab("", undefined)}
          onRenameTab={renameStoreTab}
          onSelectTab={setActiveTabId}
        />
      )}

      {!readOnly && (
        <AssetLibraryPanel
          assets={assets}
          opened={assetLibraryOpen}
          onAddFiles={(files) => void addLocalAssets(files, false)}
          onAddRemote={addRemoteAsset}
          onClose={() => setAssetLibraryOpen(false)}
          onCopySource={(asset) => void copyAssetSource(asset)}
          onInsert={(asset) => {
            insertAssetMarkdown([asset]);
            setAssetLibraryOpen(false);
          }}
          onRemove={removeAsset}
        />
      )}

      {wechatExportSnapshot && (
        <WechatExportModal
          fallbackTitle={wechatExportSnapshot.fallbackTitle}
          source={wechatExportSnapshot.source}
          style={globalState.wechatStyle}
          onClose={closeWechatExport}
          onNotify={showToast}
        />
      )}

      {!readOnly && <div className="format-toolbar">
        <IconButton title="Undo" onClick={undo}><Undo2 size={16} /></IconButton>
        <IconButton title="Redo" onClick={redo}><Redo2 size={16} /></IconButton>
        <IconButton title="Bold" onClick={() => runCommand("bold")}><Bold size={16} /></IconButton>
        <IconButton title="Italic" onClick={() => runCommand("italic")}><Italic size={16} /></IconButton>
        <IconButton title="Strike" onClick={() => runCommand("strike")}><Strikethrough size={16} /></IconButton>
        <IconButton title="Heading 1" onClick={() => runCommand("h1")}><Heading1 size={16} /></IconButton>
        <IconButton title="Heading 2" onClick={() => runCommand("h2")}><Heading2 size={16} /></IconButton>
        <IconButton title="Heading 3" onClick={() => runCommand("h3")}><Heading3 size={16} /></IconButton>
        <IconButton title="Heading 4" onClick={() => runCommand("h4")}><Heading4 size={16} /></IconButton>
        <IconButton title="Heading 5" onClick={() => runCommand("h5")}><Heading5 size={16} /></IconButton>
        <IconButton title="Heading 6" onClick={() => runCommand("h6")}><Heading6 size={16} /></IconButton>
        <IconButton title="Quote" onClick={() => runCommand("quote")}><TextQuote size={16} /></IconButton>
        <IconButton title="Bulleted list" onClick={() => runCommand("ul")}><List size={16} /></IconButton>
        <IconButton title="Numbered list" onClick={() => runCommand("ol")}><ListOrdered size={16} /></IconButton>
        <IconButton title="Task list" onClick={() => runCommand("task")}><ListChecks size={16} /></IconButton>
        <IconButton title="Horizontal rule" onClick={() => runCommand("hr")}><Minus size={16} /></IconButton>
        <IconButton title="Link" onClick={insertModals.openLinkModal}><Link size={16} /></IconButton>
        <IconButton title="Image" onClick={insertModals.openImageModal}><Image size={16} /></IconButton>
        <IconButton title="Asset library" onClick={() => setAssetLibraryOpen(true)}><Images size={16} /></IconButton>
        <IconButton title="Reference" onClick={insertModals.openReferenceModal}><BookMarked size={16} /></IconButton>
        <IconButton title="GitHub Emojis" onClick={insertModals.openEmojiModal}><Smile size={16} /></IconButton>
        <IconButton title="Symbols & HTML entities" onClick={insertModals.openSymbolsModal}><BadgeCent size={16} /></IconButton>
        <IconButton title="Markdown alerts" onClick={insertModals.openAlertModal}><BadgeAlert size={16} /></IconButton>
        <IconButton title="Inline code" onClick={() => runCommand("inlineCode")}><Code2 size={16} /></IconButton>
        <IconButton title="Code block" onClick={() => runCommand("codeBlock")}><Braces size={16} /></IconButton>
        <IconButton title="Terminal block" onClick={() => runCommand("terminal")}><Terminal size={16} /></IconButton>
        <IconButton title="Table" onClick={insertModals.openTableModal}><Table2 size={16} /></IconButton>
        <IconButton title="Math" onClick={() => runCommand("math")}><Sigma size={16} /></IconButton>
        <IconButton title="Diagram templates" onClick={insertModals.openDiagramModal}><Play size={16} /></IconButton>
        <IconButton title="Insert date and time" onClick={() => runCommand("datetime")}><CalendarClock size={16} /></IconButton>
        <IconButton title="Uppercase" onClick={() => runCommand("upper")}><CaseUpper size={16} /></IconButton>
        <IconButton title="Lowercase" onClick={() => runCommand("lower")}><CaseLower size={16} /></IconButton>
        <IconButton title="Title case" onClick={() => runCommand("title")}><ALargeSmall size={16} /></IconButton>
        <IconButton title="Find and replace" onClick={() => findReplace.setOpen(true)}><Search size={16} /></IconButton>
        <IconButton title="Clear formatting" onClick={() => runCommand("clear")}><RefreshCw size={16} /></IconButton>
        <IconButton title="Delete current document" onClick={requestClearDocument}><Trash2 size={16} /></IconButton>
        <IconButton title="Left align" onClick={() => insertAlignment("left")}><AlignLeft size={16} /></IconButton>
        <IconButton title="Center align" onClick={() => insertAlignment("center")}><AlignCenter size={16} /></IconButton>
        <IconButton title="Right align" onClick={() => insertAlignment("right")}><AlignRight size={16} /></IconButton>
        <IconButton title="Toggle fullscreen" onClick={() => void toggleFullscreen()}><Maximize2 size={16} /></IconButton>
      </div>}

      <main className="workspace" style={{ "--split": `${globalState.splitPercent}%` } as React.CSSProperties}>
        {!readOnly && <section className="editor-pane" ref={editorPaneRef}>
          <div className="pane-title">
            <FilePlus2 size={16} />{activeTab?.title || t("status.untitled")}
            {globalState.professionalProfile === "wechat" && (
              <span className="editor-image-hint"><Image size={13} />{t("wechat.dragImagesShort")}</span>
            )}
          </div>
          <div
            className={`editor-wrap${editorImageDragging ? " is-image-dragging" : ""}`}
            onDragOver={onEditorDragOver}
            onDragLeave={onEditorDragLeave}
            onDrop={onEditorDrop}
          >
            <pre className="line-numbers" aria-hidden="true">{lineNumbers(text)}</pre>
            <textarea
              ref={editorRef}
              value={text}
              spellCheck={false}
              onScroll={onScrollEditor}
              onKeyDown={onEditorKeyDown}
              onPaste={onEditorPaste}
              onContextMenu={onEditorContextMenu}
              onChange={(event) => updateActiveContent(
                event.target.value,
                false,
                (event.nativeEvent as InputEvent).inputType,
              )}
              onBlur={(event) => commitContent(event.target.value)}
              aria-label={t("view.editor")}
            />
            {editorImageDragging && (
              <div className="editor-drop-hint" role="status">
                <Image size={24} />
                <strong>{t("wechat.dropImages")}</strong>
                <span>{t("wechat.dropImagesHint")}</span>
              </div>
            )}
          </div>
        </section>}
        {!readOnly && <div className="resizer" role="separator" aria-orientation="vertical" tabIndex={0} onPointerDown={beginResize} />}
        <section className="preview-pane" ref={previewPaneRef} onScroll={onScrollPreview} onContextMenu={onPreviewContextMenu}>
          <div className="pane-title">
            <Eye size={16} />{t("view.preview")}
            {renderState === "rendering" && <span className="render-pill">{t("status.rendering")}</span>}
            {renderError && <span className="render-pill error">{renderError}</span>}
          </div>
          {globalState.professionalProfile === "wechat" && (
            <WechatModeBar
              copying={wechatCopying}
              disabled={renderState === "rendering" || Boolean(renderError)}
              style={globalState.wechatStyle}
              onCopy={() => void doQuickCopyWechat()}
              onOpenKit={() => void doCopyWechat()}
              onStyleChange={(wechatStyle) => updateGlobal({ wechatStyle })}
            />
          )}
          <PreviewPane
            ref={previewRef}
            document={previewDocument}
            findActiveIndex={findReplace.activeMatch}
            findEditorMatchCount={findReplace.matches.length}
            findOpen={findReplace.open}
            findOptions={findReplace.options}
            offlineFirst={globalState.offlineFirst}
            professionalProfile={globalState.professionalProfile}
            revisionToken={revisionToken}
            wechatStyle={globalState.wechatStyle}
            selectedBlockId={selectedPreviewBlockId}
            theme={globalState.theme}
            onBlockSelect={selectPreviewBlock}
          />
        </section>
        {(toc.length > 0 || text.trim().length > 0) && (
          <aside className="toc-panel">
            {toc.length > 0 && (
              <>
                <strong>{t("view.outline")}</strong>
                {toc.map((entry) => (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    style={{ paddingLeft: `${(entry.level - 1) * 10}px` }}
                    onClick={(event) => {
                      event.preventDefault();
                      if (previewRef.current) scrollPreviewToAnchor(previewRef.current, `#${entry.id}`);
                    }}
                  >
                    {entry.text}
                  </a>
                ))}
              </>
            )}
            <div className="health-panel">
              <strong><ShieldCheck size={15} /> {t("health.title")}</strong>
              <div className={`health-score ${health.score >= 86 ? "strong" : health.score >= 68 ? "good" : "weak"}`}>
                <span>{health.score}</span>
                <small>{health.score >= 86 ? t("health.strong") : health.score >= 68 ? t("health.good") : t("health.weak")}</small>
              </div>
              <div className="health-signals">
                <span>{t("health.headings", { count: health.signals.headings })}</span>
                <span>{t("health.links", { count: health.signals.links })}</span>
                <span>{t("health.images", { count: health.signals.images })}</span>
                <span>{t("health.code", { count: health.signals.codeBlocks })}</span>
              </div>
              <ul>
                {health.issues.length ? health.issues.slice(0, 5).map((issue) => (
                  <li key={`${issue.code}-${JSON.stringify(issue.params || {})}`} className={issue.level}>
                    {issue.line ? (
                      <button className="health-issue-button" type="button" onClick={() => jumpToLine(issue.line!)}>
                        {t(`health.issue.${issue.code}`, issue.params)}
                      </button>
                    ) : (
                      t(`health.issue.${issue.code}`, issue.params)
                    )}
                  </li>
                )) : (
                  <li className="info">{t("health.empty")}</li>
                )}
              </ul>
              <button className="health-details-button" type="button" onClick={() => setHealthOpen(true)}>
                Details
              </button>
            </div>
            {globalState.professionalProfile !== "standard" && (
              <ProfessionalProfilePanel report={professionalReport} />
            )}
          </aside>
        )}
      </main>

      {!readOnly && findReplace.open && (
        <FindReplacePanel
          activeMatch={findReplace.activeMatch}
          docked={globalState.findDocked}
          findHistory={findReplace.findHistory}
          matches={findReplace.matches}
          options={findReplace.options}
          onClose={() => findReplace.setOpen(false)}
          onDockedChange={(findDocked) => updateGlobal({ findDocked })}
          onOptionsChange={findReplace.setOptions}
          onReplaceAll={findReplace.replaceEveryMatch}
          onReplaceCurrent={findReplace.replaceCurrent}
          onStep={findReplace.cycleMatch}
          replaceHistory={findReplace.replaceHistory}
        />
      )}

      {!readOnly && githubImport.opened && <GitHubImportModal {...githubImport.modalProps} />}

      <MobileMenu
        activeTabId={activeTabId}
        globalState={globalState}
        health={health}
        opened={mobileMenuOpen}
        stats={stats}
        tabs={tabs}
        readOnly={readOnly}
        onClose={() => setMobileMenuOpen(false)}
        onCloseTab={closeTab}
        onCopyMarkdown={() => void doCopyMarkdown()}
        onCopyWechat={() => void doCopyWechat()}
        onCopyPreviewImage={() => void doCopyPreviewImage()}
        onDuplicateTab={duplicateTab}
        onExportHtml={() => void exportHtmlFile()}
        onExportMarkdown={() => void exportMarkdownFile()}
        onExportPdf={() => void doExportPdf()}
        onExportPng={() => previewRef.current && void exportPreviewPng()}
        onGithubImport={githubImport.open}
        onHealthDetails={() => setHealthOpen(true)}
        onImportFiles={() => fileInputRef.current?.click()}
        onNewTab={() => newTab("", undefined)}
        onRenameTab={renameStoreTab}
        onSelectTab={setActiveTabId}
        onShare={() => share.open("view")}
        onGlobalChange={updateGlobal}
      />

      {!readOnly && <InsertModalHost {...insertModals.hostProps} />}

      <ShareModal mode={share.mode} onClose={share.close} onCopy={share.copy} onModeChange={share.setModeUrl} tooLong={share.tooLong} url={share.url} />

      {healthOpen && (
        <DocumentHealthModal
          health={health}
          onClose={() => setHealthOpen(false)}
          onJumpToLine={(line) => {
            setHealthOpen(false);
            jumpToLine(line);
          }}
        />
      )}

      {!readOnly && findReplace.replacePreview && (
        <ReplacePreviewModal
          count={findReplace.matches.length}
          items={findReplace.replacePreview}
          onCancel={findReplace.cancelReplacePreview}
          onConfirm={findReplace.confirmReplaceEveryMatch}
        />
      )}

      {!readOnly && confirmAction && (
        <ConfirmModal
          confirmLabel={confirmAction.confirmLabel}
          danger={confirmAction.danger}
          message={confirmAction.message}
          title={confirmAction.title}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.onConfirm}
        />
      )}

      {!readOnly && dragging && <div className="drag-overlay">{t("status.dropMarkdown")}</div>}
      {pdfExport && (
        <div className="export-overlay" role="status" aria-live="polite">
          <div>
            <strong>{t("export.pdfTitle", { defaultValue: "Exporting PDF" })}</strong>
            <span>{t(PDF_EXPORT_LABEL_KEYS[pdfExport.phase], { defaultValue: pdfExport.phase })}</span>
          </div>
          <progress value={Math.round(pdfExport.progress * 100)} max={100} />
          <button type="button" onClick={cancelPdfExport} disabled={pdfExport.phase === "cancelling"}>
            {t("action.cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      )}
      {externalAsk && (
        <ExternalAskMenu
          x={externalAsk.x}
          y={externalAsk.y}
          selection={externalAsk.selection}
          onClose={() => setExternalAsk(null)}
          onCopyPrompt={() => void copyExternalAskPrompt()}
          onOpen={openExternalAsk}
        />
      )}
      <div className="sr-live-region" aria-live="polite" aria-atomic="true">{liveMessage}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );

  function insertAlignment(align: "left" | "center" | "right") {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const selected = text.slice(editor.selectionStart, editor.selectionEnd) || "Aligned text";
    const html = `<p align="${align}">${selected}</p>`;
    const next = text.slice(0, editor.selectionStart) + html + text.slice(editor.selectionEnd);
    commitContent(next);
  }
}

function getStats(text: string) {
  const words = (text.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
  const chars = text.length;
  return { words, chars, minutes: Math.max(1, Math.ceil(words / 220)) };
}

function lineNumbers(text: string) {
  const count = Math.max(1, text.split("\n").length);
  return Array.from({ length: count }, (_, index) => index + 1).join("\n");
}

function currentLineAt(text: string, offset: number) {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const nextBreak = text.indexOf("\n", offset);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return text.slice(start, end);
}

function lineRangeToOffsets(text: string, startLine: number, endLine: number) {
  const lines = splitLinesWithBreaks(text);
  const safeStartLine = Math.min(Math.max(1, startLine), lines.length);
  const safeEndLine = Math.min(Math.max(safeStartLine, endLine), lines.length);
  let start = 0;
  for (let index = 0; index < safeStartLine - 1; index += 1) {
    start += lines[index].length;
  }
  let end = start;
  for (let index = safeStartLine - 1; index < safeEndLine; index += 1) {
    end += lines[index].replace(/\r\n$|\r$|\n$/, "").length;
    if (index < safeEndLine - 1) end += lineBreakLength(lines[index]);
  }
  return { start, end };
}

function splitLinesWithBreaks(text: string) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [""];
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

function lineBreakLength(line: string) {
  const match = line.match(/\r\n$|\r$|\n$/);
  return match?.[0].length || 0;
}

function hasBinaryBytes(text: string) {
  return text.includes("\u0000");
}

function buildAssetBlockInsertion(text: string, start: number, end: number, assets: MarkdownAsset[]) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const leading = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trailing = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${leading}${assets.map(assetMarkdown).join("\n\n")}${trailing}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name);
}

function hasImageTransfer(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files);
  if (files.length > 0) return files.some(isImageFile);
  return Array.from(dataTransfer.items).some((item) => item.kind === "file" && (item.type.startsWith("image/") || !item.type));
}

function hasFileTransfer(dataTransfer: DataTransfer) {
  return dataTransfer.files.length > 0 || Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function waitForLatestPreviewRender(
  readinessRef: React.RefObject<{
    error: string;
    ready: boolean;
    revision: PreviewRevision;
    revisionToken: string;
    state: "idle" | "rendering" | "error";
  }>,
  expectedRevision: PreviewRevision,
  timeoutMs = 15_000,
) {
  const startedAt = Date.now();
  while (
    !readinessRef.current?.ready ||
    !readinessRef.current.revisionToken ||
    !samePreviewRevision(readinessRef.current.revision, expectedRevision)
  ) {
    const current = readinessRef.current;
    if (current?.state === "error") throw new Error(current.error || "Preview rendering failed.");
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Preview rendering did not finish before HTML export.");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  return readinessRef.current.revisionToken;
}

function samePreviewRevision(left: PreviewRevision, right: PreviewRevision) {
  return left.tabId === right.tabId &&
    left.content === right.content &&
    left.professionalProfile === right.professionalProfile;
}

function createConnectedWechatSnapshot(source: HTMLElement, expectedRevision: string) {
  assertPreviewRevision(source, expectedRevision);
  const snapshot = source.cloneNode(true) as HTMLElement;
  assertPreviewRevision(source, expectedRevision);
  snapshot.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.inert = true;
  Object.assign(snapshot.style, {
    left: "-100000px",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    zIndex: "-1",
  });
  document.body.appendChild(snapshot);
  return snapshot;
}

export default App;
