import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  takeScreenshot,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

const fixture = `# Smoke Fixture

Inline math $E=mc^2$ and a GitHub emoji :rocket:.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

> [!NOTE]
> Smoke note

| A | B |
|---|---|
| 1 | 2 |

\`\`\`mermaid
flowchart LR
  A[Write] --> B[Preview]
\`\`\`
`;

const startedAt = Date.now();

await withApp(async ({ consoleMessages, context, page, server }) => {
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "Smoke Fixture");
  await page.locator(".katex").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"] svg').first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".markdown-alert").first().waitFor({ state: "visible" });
  await page.locator("table").first().waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Find and replace" }).click();
  await page.locator(".find-panel").waitFor({ state: "visible" });
  await page.locator('.find-panel input[placeholder="Find"]').fill("Smoke");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".preview-find-highlight.active").first().waitFor({ state: "visible" });
  await page.locator(".find-panel").getByRole("button", { name: "x", exact: true }).click();
  await page.locator(".find-panel").waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tab", { name: /Untitled/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Actions for Untitled/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  expect((await page.getByRole("tab").count()) >= 3, "Tab action menu should duplicate the active tab.");
  await page.getByRole("tab", { name: /Welcome|Smoke|Shared|Untitled/ }).first().click();

  await page.getByRole("button", { name: "Link" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Insert link" });
  await linkDialog.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await linkDialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Table" }).click();
  await page.getByRole("dialog", { name: "Insert table" }).waitFor({ state: "visible" });
  await page.getByRole("dialog", { name: "Insert table" }).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Diagram templates" }).click();
  const diagramDialog = page.getByRole("dialog", { name: "Diagram templates" });
  await diagramDialog.waitFor({ state: "visible" });
  await diagramDialog.getByPlaceholder("Search diagrams").fill("markmap");
  await diagramDialog.getByRole("button", { name: /Markmap Roadmap/ }).click();
  await diagramDialog.getByRole("button", { name: "Insert" }).click();
  expect((await page.locator(".editor-pane textarea").inputValue()).includes("```markmap"), "Diagram template insertion did not add a Markmap code fence.");

  await page.getByRole("button", { name: "Delete current document" }).click();
  const clearDialog = page.getByRole("dialog", { name: "Clear document" });
  await clearDialog.waitFor({ state: "visible" });
  await clearDialog.getByRole("button", { name: "Cancel" }).click();
  expect((await page.locator(".editor-pane textarea").inputValue()).includes("# Smoke Fixture"), "Canceling clear confirmation should keep the document.");

  const workspaceToolbar = page.locator(".workspace-toolbar");
  await workspaceToolbar.getByRole("button", { name: "GitHub" }).click();
  await page.getByRole("dialog", { name: "Import from GitHub" }).waitFor({ state: "visible" });
  await page.getByRole("dialog", { name: "Import from GitHub" }).getByRole("button", { name: "Close Import from GitHub" }).click();

  await workspaceToolbar.getByRole("button", { name: "Share" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Share URL" });
  await shareDialog.waitFor({ state: "visible" });
  const shareUrl = await shareDialog.locator("textarea.share-url").inputValue();
  expect(shareUrl.startsWith(`${server.baseUrl}#share=eJ`), `Share URL should use current app origin. Got: ${shareUrl}`);
  expect(!shareUrl.includes("markdownviewer.pages.dev"), "Share URL must not use the old fixed public host.");
  expect(!shareUrl.endsWith("&edit=1"), "Default share URL should be view-only.");

  await shareDialog.getByRole("button", { name: "Editable" }).click();
  const editUrl = await shareDialog.locator("textarea.share-url").inputValue();
  expect(editUrl.startsWith(`${server.baseUrl}#share=eJ`), `Editable share URL should use current app origin. Got: ${editUrl}`);
  expect(editUrl.endsWith("&edit=1"), "Editable share URL should include edit=1.");

  const sharedPage = await context.newPage();
  await sharedPage.goto(editUrl, { waitUntil: "networkidle" });
  await sharedPage.locator(".editor-pane textarea").waitFor({ state: "visible" });
  expect((await sharedPage.locator(".editor-pane textarea").inputValue()).includes("# Smoke Fixture"), "Editable share URL did not restore markdown into the editor.");
  await sharedPage.close();

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto(server.baseUrl, { waitUntil: "networkidle" });
  await setMarkdown(mobilePage, "# Mobile Smoke\n\nThe responsive shell should remain usable.");
  await waitForPreviewText(mobilePage, "Mobile Smoke");
  await mobilePage.getByRole("button", { name: "Open mobile menu" }).click();
  const mobileMenu = mobilePage.getByRole("dialog", { name: "Mobile workspace menu" });
  await mobileMenu.waitFor({ state: "visible" });
  await mobileMenu.getByRole("button", { name: "GitHub" }).waitFor({ state: "visible" });
  await mobileMenu.getByRole("button", { name: "Share" }).waitFor({ state: "visible" });
  await mobilePage.getByRole("button", { name: "Close mobile menu" }).click();
  const mobileWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileWidth < 48, `Mobile layout overflow is too large: ${mobileWidth}px`);
  await takeScreenshot(mobilePage, "smoke-mobile.png");
  await mobilePage.close();

  await takeScreenshot(page, "smoke-desktop.png");
  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("smoke.json", {
    baseUrl: server.baseUrl,
    durationMs: Date.now() - startedAt,
    consoleMessages,
    shareUrlLength: shareUrl.length,
    editUrlLength: editUrl.length,
  });
});

console.log(`Smoke test passed in ${Date.now() - startedAt}ms.`);
