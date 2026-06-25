import {
  expect,
  expectNoBrowserErrors,
  setMarkdownFast,
  takeScreenshot,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

const sectionCount = 720;
const fixture = [
  "# Large Performance Fixture",
  "",
  ...Array.from({ length: sectionCount }, (_, index) => {
    const number = index + 1;
    return `## Section ${number}

Paragraph ${number} has **bold text**, _emphasis_, a [link](https://example.com/${number}), and enough plain prose to wrap across a couple of lines in the preview pane.

- Checklist input ${number}
- Another item ${number}

\`inline-${number}\`
`;
  }),
].join("\n");

const startedAt = Date.now();

await withApp(async ({ consoleMessages, page, server }) => {
  await setMarkdownFast(page, fixture);
  await waitForPreviewText(page, `Section ${sectionCount}`, 20_000);
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".preview-block").length >= expected,
    sectionCount,
    { timeout: 20_000 },
  );

  const metrics = await page.evaluate((expectedSections) => {
    const previewBlocks = document.querySelectorAll(".preview-block").length;
    const textLength = document.querySelector(".editor-pane textarea")?.value.length || 0;
    const article = document.querySelector(".preview-article");
    const previewHeight = article instanceof HTMLElement ? Math.round(article.getBoundingClientRect().height) : 0;
    const memory = performance.memory
      ? {
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        usedJSHeapSize: performance.memory.usedJSHeapSize,
      }
      : null;
    return {
      expectedSections,
      previewBlocks,
      previewHeight,
      textLength,
      memory,
    };
  }, sectionCount);

  const durationMs = Date.now() - startedAt;
  expect(durationMs < 20_000, `Large document render should remain under 20s. Duration: ${durationMs}ms`);
  expect(metrics.previewBlocks >= sectionCount, `Expected segmented preview blocks for the large fixture. Metrics: ${JSON.stringify(metrics)}`);
  expect(metrics.textLength > 120_000, `Large fixture should be substantial. Metrics: ${JSON.stringify(metrics)}`);

  await takeScreenshot(page, "perf-large-document.png");
  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("perf.json", {
    baseUrl: server.baseUrl,
    durationMs,
    consoleMessages,
    metrics,
  });
});

console.log(`Performance smoke test passed in ${Date.now() - startedAt}ms.`);
