import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

const fixture = `# Export Buttons

This document verifies the real toolbar export buttons.

| Format | Expected |
|---|---|
| MD | download |
| HTML | download |
| PNG | download |
| PDF | download |
`;

const expectedExtensions = {
  HTML: ".html",
  MD: ".md",
  PDF: ".pdf",
  PNG: ".png",
};

const startedAt = Date.now();

await withApp(async ({ consoleMessages, page }) => {
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "Export Buttons");

  const toolbar = page.locator(".workspace-toolbar");
  const downloads = {};

  for (const label of ["MD", "HTML", "PNG", "PDF"]) {
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const failure = await download.failure();
    expect(!failure, `${label} download failed: ${failure}`);
    expect(filename.toLowerCase().endsWith(expectedExtensions[label]), `${label} should download ${expectedExtensions[label]}, got ${filename}`);
    downloads[label] = filename;
  }

  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("export-buttons.json", {
    durationMs: Date.now() - startedAt,
    downloads,
  });
});

console.log(`Export buttons test passed in ${Date.now() - startedAt}ms.`);
