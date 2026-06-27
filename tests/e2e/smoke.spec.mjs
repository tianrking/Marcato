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
  await page.locator('.find-panel input[placeholder="Replace with"]').fill("Signal");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".preview-find-highlight.active").first().waitFor({ state: "visible" });
  await page.locator(".find-panel").getByRole("button", { name: "All", exact: true }).click();
  const replacePreview = page.getByRole("dialog", { name: "Replace all preview" });
  await replacePreview.waitFor({ state: "visible" });
  await replacePreview.getByRole("button", { name: "Cancel" }).click();
  expect((await page.locator(".editor-pane textarea").inputValue()).includes("# Smoke Fixture"), "Canceling replace preview should keep the document.");
  await page.locator(".find-panel").getByRole("button", { name: "x", exact: true }).click();
  await page.locator(".find-panel").waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tab", { name: /Untitled-1\.md/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Close Untitled-1\.md/ }).click();
  await page.getByRole("tab", { name: /Untitled-1\.md/ }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tab", { name: /Untitled-1\.md/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Open document library" }).click();
  const library = page.getByRole("dialog", { name: "Document library" });
  await library.waitFor({ state: "visible" });
  await library.getByLabel("Document preview").waitFor({ state: "visible" });
  await library.getByPlaceholder("Search documents").fill("Untitled");
  await library.getByText(/Untitled/).first().waitFor({ state: "visible" });
  await library.getByRole("button", { name: "Close document library" }).click();
  await library.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /Rename Untitled/ }).click();
  const tabNameInput = page.getByLabel("Tab name");
  await tabNameInput.waitFor({ state: "visible" });
  await tabNameInput.fill("Inline Rename.md");
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: /Inline Rename/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Open document library" }).click();
  await library.waitFor({ state: "visible" });
  await library.getByPlaceholder("Search documents").fill("");
  await library.getByRole("button", { name: /Rename Inline Rename/ }).first().click();
  const libraryNameInput = library.getByLabel("Library document name");
  await libraryNameInput.waitFor({ state: "visible" });
  await libraryNameInput.fill("Library Rename.md");
  await page.keyboard.press("Enter");
  await library.getByRole("button", { name: /Duplicate Library Rename/ }).first().click();
  await library.getByRole("button", { name: "Close document library" }).click();
  await library.waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "Library Rename.md" }).waitFor({ state: "visible" });
  expect((await page.getByRole("tab").count()) >= 3, "Document library should duplicate the active tab.");
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

  await page.locator(".health-panel").getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog", { name: "Document health" }).waitFor({ state: "visible" });
  await page.getByRole("dialog", { name: "Document health" }).getByRole("button", { name: "Close Document health" }).click();

  const workspaceToolbar = page.locator(".workspace-toolbar");
  await workspaceToolbar.getByRole("button", { name: "GitHub" }).click();
  const githubDialog = page.getByRole("dialog", { name: "Import from GitHub" });
  await githubDialog.waitFor({ state: "visible" });
  await githubDialog.getByPlaceholder("https://github.com/owner/repo or tree/blob URL").fill("https://example.com/not-github");
  await githubDialog.getByRole("button", { name: "List Markdown files" }).click();
  await githubDialog.getByRole("alert").waitFor({ state: "visible" });
  await githubDialog.getByRole("button", { name: "Close Import from GitHub" }).click();

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
  await mobileMenu.getByRole("button", { name: /Rename/ }).first().click();
  const mobileNameInput = mobileMenu.getByLabel("Mobile document name");
  await mobileNameInput.waitFor({ state: "visible" });
  await mobileNameInput.fill("Mobile Rename.md");
  await mobilePage.keyboard.press("Enter");
  await mobileMenu.getByText("Mobile Rename.md").waitFor({ state: "visible" });
  await mobileMenu.getByRole("button", { name: "GitHub" }).waitFor({ state: "visible" });
  await mobileMenu.getByRole("button", { name: "Share" }).waitFor({ state: "visible" });
  await mobilePage.getByRole("button", { name: "Close mobile menu" }).click();
  await mobilePage.locator(".segmented button").nth(0).click();
  const editorOnly = await mobilePage.evaluate(() => {
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    const editor = document.querySelector(".editor-pane")?.getBoundingClientRect();
    const preview = document.querySelector(".preview-pane")?.getBoundingClientRect();
    return {
      editorFills: Boolean(workspace && editor && editor.height >= workspace.height - 4),
      previewHidden: !preview || preview.height === 0,
    };
  });
  expect(editorOnly.editorFills && editorOnly.previewHidden, `Mobile editor mode should fill the workspace: ${JSON.stringify(editorOnly)}`);

  await mobilePage.locator(".segmented button").nth(2).click();
  const previewOnly = await mobilePage.evaluate(() => {
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    const editor = document.querySelector(".editor-pane")?.getBoundingClientRect();
    const preview = document.querySelector(".preview-pane")?.getBoundingClientRect();
    return {
      editorHidden: !editor || editor.height === 0,
      previewFills: Boolean(workspace && preview && preview.height >= workspace.height - 4),
    };
  });
  expect(previewOnly.editorHidden && previewOnly.previewFills, `Mobile preview mode should fill the workspace: ${JSON.stringify(previewOnly)}`);

  await mobilePage.locator(".segmented button").nth(1).click();
  const splitView = await mobilePage.evaluate(() => {
    const editor = document.querySelector(".editor-pane")?.getBoundingClientRect();
    const preview = document.querySelector(".preview-pane")?.getBoundingClientRect();
    return {
      editorVisible: Boolean(editor && editor.height > 120),
      previewVisible: Boolean(preview && preview.height > 120),
    };
  });
  expect(splitView.editorVisible && splitView.previewVisible, `Mobile split mode should keep both panes visible: ${JSON.stringify(splitView)}`);
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
