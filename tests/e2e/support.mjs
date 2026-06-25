import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export const artifactRoot = path.resolve("test-artifacts");

export function expect(condition, message) {
  if (!condition) throw new Error(message);
}

export async function ensureArtifactDir(name) {
  const dir = path.join(artifactRoot, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJsonArtifact(name, value) {
  const dir = await ensureArtifactDir("results");
  await writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function takeScreenshot(page, name) {
  const dir = await ensureArtifactDir("screenshots");
  await page.screenshot({ path: path.join(dir, name), fullPage: true });
}

export function expectNoBrowserErrors(consoleMessages) {
  const errors = consoleMessages.filter((message) => message.startsWith("error:") || message.startsWith("pageerror:"));
  expect(errors.length === 0, `Browser errors were reported:\n${errors.join("\n")}`);
}

export async function startAppServer() {
  const port = await findFreePort();
  const viteEntry = path.resolve("node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    await waitForHttp(baseUrl, 20_000);
  } catch (error) {
    await stopProcessTree(child);
    throw new Error(`Vite server did not start.\n${output}\n${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      await stopProcessTree(child);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
}

export async function withApp(testFn, options = {}) {
  const server = await startAppServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "en-US",
    viewport: options.viewport || { width: 1366, height: 900 },
  });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

  try {
    await page.goto(server.baseUrl, { waitUntil: "networkidle" });
    return await testFn({ browser, consoleMessages, context, page, server });
  } finally {
    await browser.close();
    await server.stop();
  }
}

export async function setMarkdown(page, markdown) {
  const editor = page.locator(".editor-pane textarea").first();
  await editor.waitFor({ state: "visible" });
  await editor.fill(markdown);
  return editor;
}

export async function setMarkdownFast(page, markdown) {
  const editor = page.locator(".editor-pane textarea").first();
  await editor.waitFor({ state: "visible" });
  await editor.evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, markdown);
  return editor;
}

export async function waitForPreviewText(page, text, timeout = 10_000) {
  await page.waitForFunction(
    (expected) => document.querySelector(".preview-pane")?.textContent?.includes(expected),
    text,
    { timeout },
  );
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError || new Error("Timed out waiting for server");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
