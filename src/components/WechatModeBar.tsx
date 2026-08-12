import { Copy, MessageCircle, PackageOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WechatStyle } from "../types";
import { WechatStylePicker } from "./WechatStylePicker";

interface WechatModeBarProps {
  copying: boolean;
  disabled: boolean;
  onCopy: () => void;
  onOpenKit: () => void;
  onStyleChange: (style: WechatStyle) => void;
  style: WechatStyle;
}

export function WechatModeBar({ copying, disabled, onCopy, onOpenKit, onStyleChange, style }: WechatModeBarProps) {
  const { t } = useTranslation();

  return (
    <section className="wechat-mode-bar" aria-label={t("wechat.modeTitle")}>
      <div className="wechat-mode-heading">
        <span className="wechat-mode-icon"><MessageCircle size={17} /></span>
        <span>
          <strong>{t("wechat.modeTitle")}</strong>
          <small>{t("wechat.modeHint")}</small>
        </span>
      </div>
      <WechatStylePicker compact value={style} onChange={onStyleChange} />
      <div className="wechat-mode-actions">
        <button type="button" onClick={onOpenKit}>
          <PackageOpen size={15} />{t("wechat.openKit")}
        </button>
        <button className="primary" type="button" onClick={onCopy} disabled={copying || disabled}>
          <Copy size={15} />{copying ? t("wechat.copying") : t("wechat.quickCopy")}
        </button>
      </div>
    </section>
  );
}
