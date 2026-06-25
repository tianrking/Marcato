import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildShareUrl, isShareUrlTooLong } from "../lib/share";

type ShareMode = "view" | "edit";

export function useShare(text: string, showToast: (message: string) => void) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<ShareMode>("view");

  const open = (nextMode: ShareMode = "view") => {
    const nextUrl = buildShareUrl(text, nextMode === "edit");
    setMode(nextMode);
    setUrl(nextUrl);
    if (isShareUrlTooLong(nextUrl)) showToast(t("toast.shareTooLong"));
  };

  const close = () => setUrl("");

  const setModeUrl = (nextMode: ShareMode) => {
    const nextUrl = buildShareUrl(text, nextMode === "edit");
    setMode(nextMode);
    setUrl(nextUrl);
    if (isShareUrlTooLong(nextUrl)) showToast(t("toast.shareTooLong"));
  };

  const copy = async () => {
    if (!url || isShareUrlTooLong(url)) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("toast.shareCopied"));
    } catch {
      showToast(t("toast.clipboardImageUnavailable"));
    }
  };

  return {
    close,
    copy,
    mode,
    open,
    setModeUrl,
    tooLong: isShareUrlTooLong(url),
    url,
  };
}
