import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  takeElementScreenshot,
  takeScreenshot,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

const wideImageSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="420" viewBox="0 0 1800 420">
  <rect width="1800" height="420" fill="#ffffff"/>
  <rect x="24" y="24" width="1752" height="372" rx="20" fill="#f6f8fa" stroke="#2563eb" stroke-width="8"/>
  <text x="60" y="130" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#172033">Wide PDF image fixture</text>
  <text x="60" y="230" font-family="Arial, sans-serif" font-size="42" fill="#0f766e">This image is intentionally wider than A4 content.</text>
  <path d="M60 320 C 360 220, 600 390, 900 292 S 1380 232, 1740 304" fill="none" stroke="#dc2626" stroke-width="12"/>
</svg>
`);

const tableRows = Array.from({ length: 96 }, (_, index) => {
  const row = index + 1;
  return `| Row ${row} | ${"Long cell content ".repeat(5)}${row} | ${row % 2 ? "Odd" : "Even"} |`;
}).join("\n");

const fixture = `# PDF Pagination Fixture

${Array.from({ length: 10 }, (_, index) => `Intro paragraph ${index + 1}. ${"This paragraph is long enough to create natural wrapping and page pressure. ".repeat(5)}`).join("\n\n")}

## Heading Near A Page Boundary

This heading should be moved as a unit instead of being split by a page break.

![Wide PDF visual fixture](data:image/svg+xml,${wideImageSvg})

| Item | Description | Kind |
|---|---|---|
${tableRows}

<table>
  <thead>
    <tr><th colspan="3">Complex HTML table</th></tr>
  </thead>
  <tbody>
    <tr><td rowspan="2">Merged row</td><td>Alpha</td><td>One</td></tr>
    <tr><td>Beta</td><td>Two</td></tr>
  </tbody>
</table>

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

\`\`\`mermaid
flowchart LR
  A[Author] --> B[Preview]
  B --> C[PDF layout]
  C --> D[Wide diagram fitting]
  D --> E[Pagination]
  E --> F[Download]
  F --> G[Review fixture screenshot]
\`\`\`
`;

const startedAt = Date.now();

await withApp(async ({ consoleMessages, page, server }) => {
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "PDF Pagination Fixture");
  await page.locator('img[alt="Wide PDF visual fixture"]').first().waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".katex").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"] svg').first().waitFor({ state: "visible", timeout: 20_000 });

  const metrics = await page.evaluate(async () => {
    const { A4_PDF_CONFIG, getPageHeightPx, preparePdfLayout } = await import("/src/lib/pdfPagination.ts");
    const source = document.querySelector(".preview-article");
    if (!(source instanceof HTMLElement)) throw new Error("Preview article not found.");
    const clone = await preparePdfLayout(source, A4_PDF_CONFIG);
    clone.id = "pdf-layout-fixture-capture";
    clone.style.position = "absolute";
    clone.style.left = "0";
    clone.style.top = "0";
    clone.style.zIndex = "200";
    clone.style.pointerEvents = "none";

    const containerRect = clone.getBoundingClientRect();
    const pageHeightPx = getPageHeightPx(clone, A4_PDF_CONFIG);
    const totalHeight = containerRect.height;
    const boundaries = [];
    for (let boundary = pageHeightPx; boundary < totalHeight; boundary += pageHeightPx) boundaries.push(boundary);

    const crossesBoundary = (element) => {
      const rect = element.getBoundingClientRect();
      const top = rect.top - containerRect.top;
      const bottom = rect.bottom - containerRect.top;
      return boundaries.some((boundary) => top < boundary - 1 && bottom > boundary + 1);
    };

    const visualElements = Array.from(clone.querySelectorAll("img, svg, canvas, pre, table, .diagram-viewer, .leaflet-map-canvas"))
      .filter((element) => !(element.closest("table") && element.tagName.toLowerCase() !== "table"));
    const visualOverflow = visualElements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < containerRect.left - 2 || rect.right > containerRect.right + 2;
    });
    const visualOverflowDetails = visualOverflow.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: element.className || "",
        left: Math.round(rect.left - containerRect.left),
        right: Math.round(rect.right - containerRect.left),
        width: Math.round(rect.width),
      };
    });
    const tables = Array.from(clone.querySelectorAll("table"));
    const wideBlocks = Array.from(clone.querySelectorAll("pre, table, .diagram-viewer, .leaflet-map-canvas"))
      .filter((element) => element.scrollWidth > element.clientWidth + 2);
    const rowsCrossing = Array.from(clone.querySelectorAll("tbody tr")).filter(crossesBoundary);

    return {
      estimatedPages: Math.max(1, Math.ceil(totalHeight / pageHeightPx)),
      height: Math.round(totalHeight),
      pageHeightPx: Math.round(pageHeightPx),
      pageBreakSpacers: clone.querySelectorAll(".pdf-page-break-spacer").length,
      tableBreakSpacers: clone.querySelectorAll(".pdf-table-page-break-spacer").length,
      splitTables: clone.querySelectorAll("table[data-pdf-split-part='true']").length,
      tablesWithHead: tables.filter((table) => table.querySelector("thead")).length,
      repeatedHeaderTexts: Array.from(clone.querySelectorAll("table[data-pdf-split-part='true'] thead")).map((thead) => thead.textContent?.replace(/\s+/g, " ").trim()),
      rowspanCells: clone.querySelectorAll("[rowspan]").length,
      colspanCells: clone.querySelectorAll("[colspan]").length,
      imageCount: clone.querySelectorAll("img").length,
      scaledBlocks: clone.querySelectorAll("[data-pdf-scale]").length,
      scaledImages: clone.querySelectorAll("img[data-pdf-scale]").length,
      crossingHeadings: Array.from(clone.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(crossesBoundary).length,
      crossingRows: rowsCrossing.length,
      visualOverflow: visualOverflow.length,
      visualOverflowDetails,
      wideBlocks: wideBlocks.length,
    }
  });

  expect(metrics.estimatedPages >= 3, `Expected a multi-page fixture. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.splitTables >= 1, `Expected the long table to be split. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.tablesWithHead >= 2, `Expected repeated table headers after splitting. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.repeatedHeaderTexts.some((text) => text?.includes("Item Description Kind")), `Expected split tables to repeat the Markdown table head. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.rowspanCells >= 1, `Expected rowspan cells to survive export clone. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.colspanCells >= 1, `Expected colspan cells to survive export clone. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.imageCount >= 1, `Expected PDF fixture image to survive export clone. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.scaledBlocks >= 1, `Expected at least one wide PDF visual to be scaled. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.scaledImages >= 1, `Expected the wide image to be scaled. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.crossingHeadings === 0, `Headings must not cross page boundaries. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.visualOverflow === 0, `PDF visuals should stay inside content width. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.wideBlocks === 0, `Wide PDF blocks should be fitted before export. Metrics: ${JSON.stringify(metrics)}`);
  await takeElementScreenshot(page.locator("#pdf-layout-fixture-capture"), "pdf-layout-fixture.png");
  await page.evaluate(() => document.getElementById("pdf-layout-fixture-capture")?.remove());

  const abortResult = await page.evaluate(async () => {
    const { exportPdf } = await import("/src/lib/exporters.ts");
    const source = document.querySelector(".preview-article");
    if (!(source instanceof HTMLElement)) throw new Error("Preview article not found.");
    const controller = new AbortController();
    try {
      await exportPdf("cancelled-export", source, {
        signal: controller.signal,
        onProgress: ({ phase }) => {
          if (phase === "rendering") controller.abort();
        },
      });
      return { ok: false, name: "completed", leakedClones: document.querySelectorAll(".pdf-export").length };
    } catch (error) {
      return {
        ok: error instanceof DOMException && error.name === "AbortError",
        name: error instanceof Error ? error.name : String(error),
        leakedClones: document.querySelectorAll(".pdf-export").length,
      };
    }
  });
  expect(abortResult.ok, `Expected exportPdf to abort cleanly. Result: ${JSON.stringify(abortResult)}`);
  expect(abortResult.leakedClones === 0, `Cancelled PDF export left clone nodes behind. Result: ${JSON.stringify(abortResult)}`);

  const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  await page.locator(".workspace-toolbar").getByRole("button", { name: "PDF" }).click();
  const overlay = page.locator(".export-overlay");
  await overlay.waitFor({ state: "visible", timeout: 5_000 });
  await overlay.locator("progress").waitFor({ state: "visible" });
  expect((await overlay.textContent())?.includes("Exporting PDF"), "PDF export progress overlay should be visible.");
  const download = await downloadPromise;
  expect((await download.suggestedFilename()).endsWith(".pdf"), "PDF export should produce a .pdf download.");
  await overlay.waitFor({ state: "hidden", timeout: 20_000 });
  await download.delete();

  await takeScreenshot(page, "pdf-fixture-preview.png");
  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("pdf.json", {
    baseUrl: server.baseUrl,
    durationMs: Date.now() - startedAt,
    consoleMessages,
    metrics,
  });
});

console.log(`PDF pagination test passed in ${Date.now() - startedAt}ms.`);
