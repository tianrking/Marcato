import { deflate, inflate } from "pako";
import { SHARE_URL_SOFT_LIMIT } from "./constants";

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
  const base = getShareBaseUrl();
  const payload = encodeShare(markdown);
  return `${base}#share=${payload}${editable ? "&edit=1" : ""}`;
}

export function isShareUrlTooLong(url: string) {
  return url.length > SHARE_URL_SOFT_LIMIT;
}

export function readShareFromLocation() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#share=")) return null;
  const rest = hash.slice("#share=".length);
  const ampIndex = rest.indexOf("&");
  const payload = ampIndex === -1 ? rest : rest.slice(0, ampIndex);
  const params = ampIndex === -1 ? "" : rest.slice(ampIndex + 1);
  if (!payload) return null;
  return {
    markdown: decodeShare(decodeURIComponent(payload)),
    editable: params.split("&").includes("edit=1"),
  };
}

function getShareBaseUrl() {
  if (window.location.origin && window.location.origin !== "null") return `${window.location.origin}${window.location.pathname || "/"}`;
  return window.location.href.split(/[?#]/)[0];
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
