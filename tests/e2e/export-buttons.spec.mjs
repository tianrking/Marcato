import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";
import { readFile } from "node:fs/promises";

const fixture = `# Export Buttons

This document verifies the real toolbar export buttons.

| Format | Expected |
|---|---|
| MD | download |
| HTML | download |
| PNG | download |
| PDF | download |

Inline math $E=mc^2$.

## Color compatibility

<div class="platform-admonition platform-admonition-info"><p class="platform-admonition-title">Export compatibility</p><div class="platform-admonition-body"><p>Modern profile colors must export to PNG and PDF.</p></div></div>

<button>Keep authored button text</button>

\`\`\`mermaid
flowchart LR
  A[Live preview] --> B[Exported HTML]
\`\`\`
`;

const expectedFilenames = {
  HTML: "welcome.html",
  MD: "welcome.md",
  PDF: "welcome.pdf",
  PNG: "welcome.png",
};

const startedAt = Date.now();

await withApp(async ({ consoleMessages, page }) => {
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "Export Buttons");
  await page.locator(".math-inline .katex").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"] svg').waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector(".preview-article");
    return root?.dataset.exportReady === "1" &&
      !root.querySelector(".diagram-viewer.is-loading,.math-inline:not([data-rendered='1']),.math-block:not([data-rendered='1'])");
  }, null, { timeout: 20_000 });

  const toolbar = page.locator(".workspace-toolbar");
  const downloads = {};

  for (const label of ["MD", "HTML", "PNG", "PDF"]) {
    console.log(`Starting ${label} export...`);
    const exportStartedAt = Date.now();
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(async (error) => {
      const diagnostics = await page.evaluate(() => {
        const preview = document.querySelector(".preview-article");
        const toast = document.querySelector(".toast");
        return {
          exportReady: preview?.getAttribute("data-export-ready"),
          pdfRendering: document.documentElement.dataset.pdfRendering || "",
          pendingDiagrams: preview?.querySelectorAll(".diagram-viewer.is-loading").length || 0,
          pendingMath: preview?.querySelectorAll(".math-inline:not([data-rendered='1']),.math-block:not([data-rendered='1'])").length || 0,
          toast: toast?.textContent || "",
        };
      });
      throw new Error(`${label} download timed out: ${error.message}. Diagnostics: ${JSON.stringify(diagnostics)}`);
    });
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const failure = await download.failure();
    expect(!failure, `${label} download failed: ${failure}`);
    expect(filename.toLowerCase() === expectedFilenames[label], `${label} should download ${expectedFilenames[label]}, got ${filename}`);
    if (label === "HTML") {
      const path = await download.path();
      expect(Boolean(path), "HTML download should have a readable local path.");
      const html = await readFile(path, "utf8");
      expect(html.includes("katex-html"), "HTML export should contain the rendered KaTeX output.");
      expect(html.includes('aria-label="Mermaid diagram"'), "HTML export should contain the rendered Mermaid SVG.");
      expect(!html.includes("Rendering Mermaid"), "HTML export must not contain the pre-render Mermaid placeholder.");
      expect(!html.includes('class="diagram-toolbar"'), "HTML export should omit interactive preview-only diagram controls.");
      expect(html.includes("Keep authored button text"), "HTML export should preserve author-authored button content.");
      expect(html.includes('data-profile="standard"'), "HTML export should preserve the active preview profile context.");
      expect(html.includes("preview-article profile-standard"), "HTML export should retain preview classes required by profile CSS.");
    }
    if (label === "PNG") {
      const path = await download.path();
      expect(Boolean(path), "PNG download should have a readable local path.");
      const png = await readFile(path);
      expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PNG export should have a valid PNG signature.");
      expect(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, "PNG export should have non-zero dimensions.");
    }
    downloads[label] = filename;
    console.log(`${label} export passed in ${Date.now() - exportStartedAt}ms.`);
  }

  const latestMarker = "LATEST-REVISION-MUST-BE-EXPORTED";
  const editor = page.locator(".editor-pane textarea").first();
  const latestMarkdown = `# ${latestMarker}\n\n${"Fresh content.\n\n".repeat(2_000)}`;
  await editor.fill(latestMarkdown);
  const latestDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await toolbar.getByRole("button", { name: "HTML", exact: true }).click();
  const latestDownload = await latestDownloadPromise;
  const latestPath = await latestDownload.path();
  expect(Boolean(latestPath), "Latest-revision HTML download should have a readable local path.");
  const latestHtml = await readFile(latestPath, "utf8");
  expect(latestHtml.includes(latestMarker), "HTML export should wait for and snapshot the latest Markdown revision.");

  for (const [label, selector] of [["PNG", ".image-export"], ["PDF", ".pdf-export"]]) {
    const marker = `${label}-LATEST-REVISION-MUST-BE-EXPORTED`;
    await page.evaluate((cloneSelector) => {
      window.__latestPreviewCloneText = "";
      const observer = new MutationObserver(() => {
        const clone = document.querySelector(cloneSelector);
        if (!clone) return;
        window.__latestPreviewCloneText = clone.textContent || "";
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true });
    }, selector);
    await editor.fill(`# ${marker}\n\n<!-- ${"x".repeat(21_000)} -->`);
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    await downloadPromise;
    const clonedText = await page.evaluate(() => window.__latestPreviewCloneText || "");
    expect(clonedText.includes(marker), `${label} export cloned a stale preview revision.`);
  }

  await page.locator(".profile-select").selectOption("docusaurus");
  await editor.fill(`# Profile color export\n\n## CSS Color 4 heading\n\n:::tip[Compatibility]\nModern profile colors must survive html2canvas.\n:::`);
  await waitForPreviewText(page, "Modern profile colors must survive html2canvas.");
  for (const label of ["PNG", "PDF"]) {
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    const download = await downloadPromise;
    expect(!(await download.failure()), `${label} should export a Docusaurus profile containing color-mix styles.`);
  }

  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("export-buttons.json", {
    durationMs: Date.now() - startedAt,
    downloads,
  });
});

console.log(`Export buttons test passed in ${Date.now() - startedAt}ms.`);
