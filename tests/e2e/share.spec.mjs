import { chromium } from "playwright";
import { deflate } from "pako";
import { expect, expectNoBrowserErrors, startAppServer, waitForPreviewText } from "./support.mjs";

const STORAGE_KEYS = [
  "markdownViewerTabs",
  "markdownViewerActiveTab",
  "markdownViewerUntitledCounter",
  "markdownViewerGlobalState",
  "markdownViewerAssets",
  "app-lang",
  "find-replace-docked",
];

const server = await startAppServer();
const browser = await chromium.launch({ headless: true });

try {
  await verifyShareModesAndPersistence();
  await verifyMalformedShareFallsBackToDefault();
  console.log("Share safety checks passed.");
} finally {
  await browser.close();
  await server.stop();
}

async function verifyShareModesAndPersistence() {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const browserErrors = trackBrowserErrors(page);

  try {
    await openFresh(page, server.baseUrl);
    const editor = page.locator(".editor-pane textarea");
    await editor.waitFor({ state: "visible" });

    await editor.fill("# Shared payload\n\nThis content came from a share URL.");
    await waitForPreviewText(page, "Shared payload");

    const toolbar = page.locator(".workspace-toolbar");
    await toolbar.getByRole("button", { name: "Share" }).click();
    const shareDialog = page.getByRole("dialog", { name: "Share URL" });
    await shareDialog.waitFor({ state: "visible" });
    const viewUrl = await shareDialog.locator("textarea.share-url").inputValue();
    await shareDialog.getByRole("button", { name: "Editable" }).click();
    const editUrl = await shareDialog.locator("textarea.share-url").inputValue();
    await shareDialog.getByRole("button", { name: "Close Share URL" }).click();

    expect(!viewUrl.endsWith("&edit=1"), "View-only share URL unexpectedly enabled editing.");
    expect(editUrl.endsWith("&edit=1"), "Editable share URL did not include edit=1.");

    await editor.fill("# Local workspace original\n\nThis content must survive every share visit.");
    await editor.blur();
    await page.waitForFunction(() => localStorage.getItem("markdownViewerTabs")?.includes("Local workspace original"));
    const persistedBeforeShare = await readPersistedWorkspace(page);

    await openFresh(page, viewUrl);
    await page.locator('[data-share-mode="view"]').waitFor({ state: "attached" });
    await waitForPreviewText(page, "Shared payload");
    const shareHashBeforeOutline = await page.evaluate(() => window.location.hash);
    await page.locator(".toc-panel a").first().evaluate((link) => link.click());
    expect(await page.evaluate(() => window.location.hash) === shareHashBeforeOutline, "Outline navigation replaced the share payload hash.");
    expect(await page.locator('[data-share-mode="view"]').count() === 1, "Outline navigation exited the share session.");
    expect(await page.locator(".editor-pane textarea").count() === 0, "View-only share kept the editor in the DOM.");
    expect(await page.locator(".format-toolbar").count() === 0, "View-only share exposed formatting controls.");
    expect(await page.locator(".segmented").count() === 0, "View-only share exposed editor/split view controls.");
    expect(await page.getByRole("button", { name: "Open document library" }).count() === 0, "View-only share exposed the document library.");
    expect(await toolbar.getByRole("button", { name: "New", exact: true }).count() === 0, "View-only share exposed New.");
    expect(await toolbar.getByRole("button", { name: "Import", exact: true }).count() === 0, "View-only share exposed Import.");
    expect(await toolbar.getByRole("button", { name: "GitHub", exact: true }).count() === 0, "View-only share exposed GitHub import.");
    expect(await page.getByRole("button", { name: "New tab" }).count() === 0, "View-only share exposed New tab.");
    expect(await page.getByRole("button", { name: /Rename Shared view/ }).count() === 0, "View-only share exposed tab rename.");
    expect(await page.getByRole("button", { name: /Close Shared view/ }).count() === 0, "View-only share exposed tab close.");

    await page.keyboard.press("Alt+Shift+T");
    await page.keyboard.press("Alt+Shift+W");
    expect(await page.getByRole("tab").count() === 1, "View-only keyboard shortcuts mutated the tab list.");
    expect(await page.getByRole("dialog", { name: "Close tab" }).count() === 0, "View-only close shortcut opened a mutation dialog.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open mobile menu" }).click();
    const mobileMenu = page.getByRole("dialog", { name: "Mobile workspace menu" });
    await mobileMenu.waitFor({ state: "visible" });
    expect(await mobileMenu.getByRole("button", { name: "New", exact: true }).count() === 0, "Mobile view-only share exposed New.");
    expect(await mobileMenu.getByRole("button", { name: "Import", exact: true }).count() === 0, "Mobile view-only share exposed Import.");
    expect(await mobileMenu.getByRole("button", { name: "GitHub", exact: true }).count() === 0, "Mobile view-only share exposed GitHub import.");
    expect(await mobileMenu.getByRole("button", { name: /Rename Shared view/ }).count() === 0, "Mobile view-only share exposed tab rename.");
    expect(await mobileMenu.getByRole("button", { name: /Duplicate Shared view/ }).count() === 0, "Mobile view-only share exposed tab duplicate.");
    expect(await mobileMenu.getByRole("button", { name: /Close Shared view/ }).count() === 0, "Mobile view-only share exposed tab close.");
    expect(await mobileMenu.locator(".mobile-view-grid").count() === 0, "Mobile view-only share exposed editor/split view controls.");
    await mobileMenu.getByRole("button", { name: "Close mobile menu" }).click();
    await page.setViewportSize({ width: 1366, height: 900 });
    expectWorkspaceEqual(await readPersistedWorkspace(page), persistedBeforeShare, "view-only share");

    await openFresh(page, server.baseUrl);
    await editor.waitFor({ state: "visible" });
    expect((await editor.inputValue()).includes("Local workspace original"), "Clean URL did not restore the original local workspace after view-only share.");

    const samePageShareNavigation = page.waitForNavigation({ waitUntil: "networkidle" });
    await page.evaluate((url) => {
      window.location.href = url;
    }, viewUrl);
    await samePageShareNavigation;
    await page.locator('[data-share-mode="view"]').waitFor({ state: "attached" });
    await waitForPreviewText(page, "Shared payload");

    const samePageShareExit = page.waitForNavigation({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.location.hash = "";
    });
    await samePageShareExit;
    await editor.waitFor({ state: "visible" });
    expect((await editor.inputValue()).includes("Local workspace original"), "Leaving a same-page share URL did not restore the local workspace.");
    expectWorkspaceEqual(await readPersistedWorkspace(page), persistedBeforeShare, "same-page share navigation");

    const maliciousMarkmap = `# Shared Markmap safety\n\n\`\`\`markmap\n# Safe root\n## <strong>Safe label</strong>\n- <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" onload="window.__markmapSharePwned='image'"> image\n- <a href="javascript:window.__markmapSharePwned='link'">unsafe link</a>\n- <script>window.__markmapSharePwned='script'</script>script\n\`\`\``;
    const maliciousSharePayload = Buffer.from(deflate(new TextEncoder().encode(maliciousMarkmap))).toString("base64url");
    await openFresh(page, `${server.baseUrl}#share=${maliciousSharePayload}`);
    await page.locator('[data-share-mode="view"]').waitFor({ state: "attached" });
    await page.locator('.diagram-viewer[data-diagram-engine="markmap"] svg.markmap-svg').waitFor({ state: "visible", timeout: 20_000 });
    const markmapSafety = await page.evaluate(() => {
      const svg = document.querySelector('.diagram-viewer[data-diagram-engine="markmap"] svg.markmap-svg');
      return {
        dangerousHrefs: Array.from(svg?.querySelectorAll("[href]") || [])
          .map((element) => element.getAttribute("href") || "")
          .filter((href) => href.replace(/\s+/g, "").toLowerCase().startsWith("javascript:")),
        eventAttrs: Array.from(svg?.querySelectorAll("*") || [])
          .flatMap((element) => Array.from(element.attributes).filter((attribute) => /^on/i.test(attribute.name)).map((attribute) => attribute.name)),
        hasSafeLabel: Boolean(svg?.querySelector("strong")),
        pwned: window.__markmapSharePwned || null,
        scripts: svg?.querySelectorAll("script").length || 0,
      };
    });
    expect(markmapSafety.hasSafeLabel, `Shared Markmap lost legitimate markup: ${JSON.stringify(markmapSafety)}`);
    expect(markmapSafety.pwned === null && markmapSafety.scripts === 0 && markmapSafety.eventAttrs.length === 0 && markmapSafety.dangerousHrefs.length === 0, `Shared Markmap executable HTML survived: ${JSON.stringify(markmapSafety)}`);
    expectWorkspaceEqual(await readPersistedWorkspace(page), persistedBeforeShare, "malicious Markmap share");

    await openFresh(page, editUrl);
    await page.locator('[data-share-mode="edit"]').waitFor({ state: "attached" });
    await editor.waitFor({ state: "visible" });
    expect((await editor.inputValue()).includes("Shared payload"), "Editable share did not restore its payload into the editor.");
    expect(await page.locator(".format-toolbar").count() === 1, "Editable share hid formatting controls.");
    expect(await toolbar.getByRole("button", { name: "New", exact: true }).count() === 1, "Editable share hid workspace editing controls.");
    await editor.fill("# Edited only in the shared session");
    await editor.blur();
    const assetLibraryButton = page.getByRole("button", { name: "Asset library" });
    await assetLibraryButton.click();
    const assetLibrary = page.getByRole("dialog", { name: "Asset library" });
    await assetLibrary.getByText("Remote image URL").locator("..").getByRole("textbox").fill("https://example.com/shared-only.png");
    await assetLibrary.getByRole("button", { name: "Register" }).click();
    await page.locator(".toast").filter({ hasText: "Remote image registered" }).waitFor({ state: "visible" });
    await assetLibrary.getByRole("button", { name: "Close asset library" }).click();
    expectWorkspaceEqual(await readPersistedWorkspace(page), persistedBeforeShare, "editable share");

    await openFresh(page, server.baseUrl);
    await editor.waitFor({ state: "visible" });
    expect((await editor.inputValue()).includes("Local workspace original"), "Editable share replaced the original persisted workspace.");

    const payload = viewUrl.split("#share=")[1].split("&")[0];
    const decompressionBomb = Buffer.from(deflate(new TextEncoder().encode("A".repeat(10 * 1024 * 1024 + 1)))).toString("base64url");
    const malformedUrls = [
      `${server.baseUrl}#share=%`,
      `${server.baseUrl}#share=${payload.slice(0, Math.max(2, Math.floor(payload.length / 2)))}`,
      `${server.baseUrl}#share=not-valid***`,
      `${server.baseUrl}#share=${decompressionBomb}`,
    ];
    for (const malformedUrl of malformedUrls) {
      await openFresh(page, malformedUrl);
      await editor.waitFor({ state: "visible" });
      expect((await editor.inputValue()).includes("Local workspace original"), `Malformed share did not fall back to local workspace: ${malformedUrl}`);
      expect(await page.locator("[data-share-mode]").count() === 0, "Malformed share was incorrectly treated as a share session.");
      expectWorkspaceEqual(await readPersistedWorkspace(page), persistedBeforeShare, "malformed share");
    }

    expectNoBrowserErrors(browserErrors);
  } finally {
    await context.close();
  }
}

async function verifyMalformedShareFallsBackToDefault() {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const browserErrors = trackBrowserErrors(page);

  try {
    await openFresh(page, `${server.baseUrl}#share=eJ`);
    const editor = page.locator(".editor-pane textarea");
    await editor.waitFor({ state: "visible" });
    expect((await editor.inputValue()).trim().length > 0, "Malformed share with no local data did not load the default workspace.");
    expect(await page.getByRole("tab", { name: /Welcome\.md/ }).count() === 1, "Malformed share with no local data did not create the default Welcome tab.");
    expect(await page.locator("[data-share-mode]").count() === 0, "Truncated share was incorrectly treated as a share session.");
    expectNoBrowserErrors(browserErrors);
  } finally {
    await context.close();
  }
}

async function openFresh(page, url) {
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "networkidle" });
}

async function readPersistedWorkspace(page) {
  return await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), STORAGE_KEYS);
}

function expectWorkspaceEqual(actual, expected, scenario) {
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${scenario} changed persisted workspace state.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
}

function trackBrowserErrors(page) {
  const messages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}
