import { deflate, Inflate } from "pako";
import {
  MAX_SHARE_COMPRESSED_BYTES,
  MAX_SHARE_DECOMPRESSED_BYTES,
  SHARE_URL_SOFT_LIMIT,
} from "./constants";

const MAX_SHARE_PAYLOAD_CHARS = Math.ceil(MAX_SHARE_COMPRESSED_BYTES / 3) * 4;
const INFLATE_CHUNK_BYTES = 64 * 1024;

export function encodeShare(markdown: string) {
  const bytes = new TextEncoder().encode(markdown);
  const compressed = deflate(bytes);
  return bytesToBase64Url(compressed);
}

export function decodeShare(payload: string) {
  const bytes = base64UrlToBytes(payload);
  const inflator = new Inflate({ chunkSize: INFLATE_CHUNK_BYTES });
  const decoder = new TextDecoder();
  const textChunks: string[] = [];
  let outputBytes = 0;

  inflator.onData = (chunk) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAX_SHARE_DECOMPRESSED_BYTES) {
      throw new Error("Share payload exceeds the decompressed size limit.");
    }
    textChunks.push(decoder.decode(chunk, { stream: true }));
  };

  if (!inflator.push(bytes, true) || inflator.err) {
    throw new Error(inflator.msg || "Share payload could not be decompressed.");
  }
  textChunks.push(decoder.decode());
  return textChunks.join("");
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
  if (!payload || payload.length > MAX_SHARE_PAYLOAD_CHARS) return null;
  try {
    return {
      markdown: decodeShare(decodeURIComponent(payload)),
      editable: params.split("&").includes("edit=1"),
    };
  } catch {
    // A copied URL may be truncated or malformed. Treat it like a normal app
    // URL so a bad share never prevents the local workspace from loading.
    return null;
  }
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
  if (value.length > MAX_SHARE_PAYLOAD_CHARS) {
    throw new Error("Share payload exceeds the compressed size limit.");
  }
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("Share payload is not valid base64url.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  if (binary.length > MAX_SHARE_COMPRESSED_BYTES) {
    throw new Error("Share payload exceeds the compressed size limit.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
