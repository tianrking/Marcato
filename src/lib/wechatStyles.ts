import type { WechatStyle } from "../types";

export interface WechatStyleMeta {
  accent: string;
  descriptionKey: string;
  id: WechatStyle;
  labelKey: string;
  surface: string;
}

export const WECHAT_STYLES: readonly WechatStyleMeta[] = [
  {
    id: "editorial",
    labelKey: "wechat.styleEditorial",
    descriptionKey: "wechat.styleEditorialHint",
    accent: "#a47c48",
    surface: "#f6f3ee",
  },
  {
    id: "minimal",
    labelKey: "wechat.styleMinimal",
    descriptionKey: "wechat.styleMinimalHint",
    accent: "#202124",
    surface: "#f5f5f5",
  },
  {
    id: "tech",
    labelKey: "wechat.styleTech",
    descriptionKey: "wechat.styleTechHint",
    accent: "#2563eb",
    surface: "#eef4ff",
  },
  {
    id: "fresh",
    labelKey: "wechat.styleFresh",
    descriptionKey: "wechat.styleFreshHint",
    accent: "#07a36a",
    surface: "#edf9f4",
  },
];

export function wechatStyleClassName(style: WechatStyle) {
  return `wechat-style-${style}`;
}

export function normalizeWechatStyle(value: unknown): WechatStyle {
  return WECHAT_STYLES.some((style) => style.id === value) ? value as WechatStyle : "editorial";
}
