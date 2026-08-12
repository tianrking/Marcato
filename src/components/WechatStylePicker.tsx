import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { WECHAT_STYLES } from "../lib/wechatStyles";
import type { WechatStyle } from "../types";

interface WechatStylePickerProps {
  compact?: boolean;
  onChange: (style: WechatStyle) => void;
  value: WechatStyle;
}

export function WechatStylePicker({ compact = false, onChange, value }: WechatStylePickerProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`wechat-style-picker${compact ? " compact" : ""}`}
      role="radiogroup"
      aria-label={t("wechat.styleLabel")}
    >
      {WECHAT_STYLES.map((style) => {
        const label = t(style.labelKey);
        const description = t(style.descriptionKey);
        return (
          <button
            key={style.id}
            className="wechat-style-option"
            type="button"
            role="radio"
            aria-checked={style.id === value}
            aria-label={`${label} — ${description}`}
            title={description}
            data-style={style.id}
            onClick={() => onChange(style.id)}
            style={{
              "--wechat-style-accent": style.accent,
              "--wechat-style-surface": style.surface,
            } as CSSProperties}
          >
            <span className="wechat-style-swatch" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="wechat-style-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
