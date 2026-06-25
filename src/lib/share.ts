import { deflate, inflate } from "pako";

export function encodeShare(markdown: string) {
  const bytes = new TextEncoder().encode(markdown);
  const compressed = deflate(bytes);
  return bytesToBase64Url(compressed);
}

export function decodeShare(payload: string) {
  const bytes = base64UrlToBytes(payload);
  return new TextDecoder().decode(inflate(bytes));
}

export function buildShareUrl(markdown: string, editable: boolean) {
  const base = isLocalBase() ? "https://markdownviewer.pages.dev/" : `${window.location.origin}${window.location.pathname}`;
  const payload = encodeShare(markdown);
  return `${base}#share=${payload}${editable ? "&edit=1" : ""}`;
}

export function readShareFromLocation() {
  const hash = window.location.hash || "";
  const match = /share=([^&]+)/.exec(hash);
  if (!match) return null;
  return {
    markdown: decodeShare(decodeURIComponent(match[1])),
    editable: /(?:^|&)edit=1(?:&|$)/.test(hash.replace(/^#/, "")),
  };
}

function isLocalBase() {
  return ["", "null"].includes(window.location.origin) || /^https?:\/\/(?:localhost|127\.0\.0\.1)/.test(window.location.origin);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
