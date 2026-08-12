import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  takeElementScreenshot,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";
import { readFile } from "node:fs/promises";

const fixture = `# WeChat Paste Fixture

Read the [official documentation](https://example.com/docs) and keep the bare URL <https://example.com/bare>.

This [WeChat article](https://mp.weixin.qq.com/s/example) may remain clickable, while [jumping inside](#details) must not.

Contact [the editor](mailto:editor@example.com).

![Remote architecture](https://cdn.example.com/architecture.png "Architecture source")

![Local cover](./assets/cover.png)

![Embedded draft](data:image/png;base64,iVBORw0KGgo=)

Inline math $E=mc^2$ remains editable.

$$
\\sum_{i=1}^{n} i
$$

\`\`\`mermaid
flowchart LR
  A[Write] --> B[Publish]
\`\`\`

## Details

The paste draft must keep every manual insertion position.
`;

const startedAt = Date.now();
const pixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

await withApp(async ({ consoleMessages, page }) => {
  await page.route(/https:\/\/(?:cdn\.example\.com|example\.com|mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)\//, (route) => route.fulfill({
    body: pixelPng,
    contentType: "image/png",
    status: 200,
  }));
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "WeChat Paste Fixture");
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"] svg').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".profile-select").selectOption("wechat");
  const modeBar = page.locator(".wechat-mode-bar");
  await modeBar.waitFor({ state: "visible" });
  expect(await modeBar.getByRole("radio").count() === 4, "WeChat mode should expose four dedicated article styles.");
  await takeElementScreenshot(page.locator(".preview-article"), "wechat-editorial-preview.png");

  await modeBar.getByRole("radio", { name: /Tech blue/ }).click();
  await page.locator(".preview-article.wechat-style-tech").waitFor({ state: "visible" });
  const selectedStyle = await page.evaluate(() => {
    const heading = document.querySelector(".preview-article h2");
    const article = document.querySelector(".preview-article");
    if (!(heading instanceof HTMLElement) || !(article instanceof HTMLElement)) throw new Error("Styled WeChat preview was unavailable.");
    const computed = getComputedStyle(heading);
    const stored = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    return {
      backgroundColor: computed.backgroundColor,
      borderLeftWidth: computed.borderLeftWidth,
      dataStyle: article.dataset.wechatStyle,
      storedStyle: stored.wechatStyle,
    };
  });
  expect(selectedStyle.dataStyle === "tech" && selectedStyle.storedStyle === "tech", `Style selection should update and persist: ${JSON.stringify(selectedStyle)}`);
  expect(selectedStyle.backgroundColor === "rgb(238, 244, 255)" && selectedStyle.borderLeftWidth === "4px", `Tech style should visibly alter the article hierarchy: ${JSON.stringify(selectedStyle)}`);
  await takeElementScreenshot(page.locator(".preview-article"), "wechat-tech-preview.png");

  const payload = await page.evaluate(async () => {
    const root = document.querySelector(".preview-article");
    if (!(root instanceof HTMLElement)) throw new Error("Preview article was not available.");
    const { buildWechatClipboardPayload, buildWechatCopyReadyDocument, extractWechatDraftMetadata } = await import("/src/lib/wechatExport.ts");
    const built = buildWechatClipboardPayload(root, { excludeTitle: true });
    const parsed = new DOMParser().parseFromString(built.html, "text/html");
    const anchors = Array.from(parsed.querySelectorAll("a[href]")).map((anchor) => anchor.getAttribute("href") || "");
    const count = (value, target) => value.split(target).length - 1;
    const edgeRoot = document.createElement("article");
    edgeRoot.innerHTML = `
      <p><img src="https://cdn.example.com/before-slider.png" alt="Before slider"></p>
      <section class="wechat-slider">
        <section><img src="https://cdn.example.com/inside-slider.png" alt="Inside slider"><p>Slider caption</p></section>
        <section><img src="https://mmbiz.qpic.cn/mmbiz_png/example/640?wx_fmt=png" alt="Hosted inside slider"><p>Hosted caption</p></section>
      </section>
      <p><a href="https://example.com/linked-article"><img src="./linked-cover.png" alt="Linked cover"></a></p>
      <p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Portable local"></p>
      <p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg" alt="Already hosted"></p>
    `;
    const edgeBuilt = buildWechatClipboardPayload(edgeRoot);
    const edgeParsed = new DOMParser().parseFromString(edgeBuilt.html, "text/html");
    const metadata = extractWechatDraftMetadata(root, "fallback.md");
    const copyReady = buildWechatCopyReadyDocument(root, metadata, { excludeTitle: true, style: "tech" });
    const { createLocalAssetCandidate, embedLocalImagesInMarkdown, hydrateAssetReferences } = await import("/src/lib/assets.ts");
    const localFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.png", { type: "image/png" });
    Object.defineProperty(localFile, "webkitRelativePath", { configurable: true, value: "article/images/cover.png" });
    const localCandidate = await createLocalAssetCandidate(localFile);
    const bundled = embedLocalImagesInMarkdown(
      "![Cover](../images/cover.png)\n\n<img src=\"../images/cover.png\" alt=\"HTML cover\">\n\n![Remote](https://example.com/remote.png)",
      [localCandidate],
      "article/docs/post.md",
    );
    const hydratedBundle = hydrateAssetReferences(bundled.markdown, [localCandidate.asset]);
    return {
      anchors,
      bareUrlCount: count(built.plainText, "https://example.com/bare"),
      buttonCount: parsed.querySelectorAll("button").length,
      canvasCount: parsed.querySelectorAll("canvas").length,
      html: built.html,
      imageCount: parsed.querySelectorAll("img").length,
      headingCount: parsed.querySelectorAll("h1").length,
      plainText: built.plainText,
      stats: built.stats,
      svgCount: parsed.querySelectorAll("svg").length,
      metadata,
      copyReady: {
        hasControls: copyReady.includes('id="wechat-copy-article"') && copyReady.includes("copyArticle()"),
        hasEmbeddedImage: copyReady.includes("data:image/png;base64,iVBORw0KGgo="),
        hasStyle: copyReady.includes('data-wechat-style="tech"') && copyReady.includes("rgb(238, 244, 255)"),
        hasTitleInBody: /id="wechat-copy-article"[\s\S]*?<h1\b/i.test(copyReady),
      },
      bundled: {
        embeddedCount: bundled.embeddedCount,
        compactReferences: (bundled.markdown.match(/marcato-asset:/g) || []).length,
        hydratedImages: (hydratedBundle.match(/data:image\/png;base64/g) || []).length,
        keepsRemote: bundled.markdown.includes("https://example.com/remote.png"),
        usedAssets: bundled.usedAssetIds.size,
      },
      edge: {
        imageCount: edgeParsed.querySelectorAll("img").length,
        plainText: edgeBuilt.plainText,
        stats: edgeBuilt.stats,
      },
    };
  });

  expect(payload.anchors.length === 1 && payload.anchors[0] === "https://mp.weixin.qq.com/s/example", `Only the visible WeChat article link should remain clickable: ${JSON.stringify(payload.anchors)}`);
  expect(payload.plainText.includes("official documentation https://example.com/docs"), "Ordinary external link text and its full URL should stay together.");
  expect(payload.plainText.includes("WeChat article https://mp.weixin.qq.com/s/example"), "The WeChat article link should also expose its full URL.");
  expect(payload.plainText.includes("the editor editor@example.com"), "mailto links should expose the actual address.");
  expect(payload.bareUrlCount === 1, `A bare URL should not be duplicated. Count: ${payload.bareUrlCount}`);
  expect(!payload.plainText.includes("引用链接"), "The old detached citation appendix should not be generated.");
  expect(payload.imageCount === 1, `The embedded PNG should remain in rich HTML while remote and unresolved paths become annotations. Found: ${payload.imageCount}`);
  expect(payload.headingCount === 0, "The publishing body should exclude the first H1 when the title is copied separately.");
  expect(payload.svgCount === 0 && payload.canvasCount === 0, "Rendered diagrams must not leak SVG/canvas into the WeChat clipboard.");
  expect(payload.buttonCount === 0, "Preview controls must not enter the WeChat clipboard.");
  expect(payload.plainText.includes("【图片 1：Remote architecture】") && payload.plainText.includes("原图：https://cdn.example.com/architecture.png"), "Remote images should keep an insertion note and visible source.");
  expect(payload.plainText.includes("【图片 2：Local cover】") && payload.plainText.includes("./assets/cover.png"), "Local images should keep an insertion note and their original path.");
  expect(payload.plainText.includes("【微信图片：Embedded draft】") && payload.plainText.includes("图片已随富文本内嵌"), "The plain-text fallback should describe embedded images without dumping their payload.");
  expect(!payload.plainText.includes("iVBORw0KGgo") && payload.html.includes("iVBORw0KGgo"), "Base64 must stay in rich HTML but never leak into plain text.");
  expect(payload.plainText.includes("【图表：Mermaid；请在此处手动插入导出的 PNG】"), "Mermaid should produce a visible insertion note.");
  expect(payload.plainText.includes("```mermaid\nflowchart LR\n  A[Write] --> B[Publish]\n```"), "The original Mermaid source should remain directly editable.");
  expect(!payload.plainText.includes("Rendering Mermaid"), "Loading state must not enter the clipboard.");
  expect(payload.plainText.includes("$E=mc^2$") && payload.plainText.includes("```latex\n\\sum_{i=1}^{n} i\n```"), "Inline and block math should retain editable source.");
  expect(payload.stats.imagePlaceholders === 2 && payload.stats.embeddedImages === 1, `Expected two manual placeholders and one direct embedded image. Stats: ${JSON.stringify(payload.stats)}`);
  expect(payload.stats.diagrams === 1, `Expected one diagram source block. Stats: ${JSON.stringify(payload.stats)}`);
  expect(payload.stats.math === 2, `Expected two editable math fallbacks. Stats: ${JSON.stringify(payload.stats)}`);
  const orderedImageLabels = ["【图片 1：Before slider】", "【图片 2：Inside slider】", "【图片 3：Linked cover】"];
  const orderedImageOffsets = orderedImageLabels.map((label) => payload.edge.plainText.indexOf(label));
  expect(orderedImageOffsets.every((offset, index) => offset >= 0 && (index === 0 || offset > orderedImageOffsets[index - 1])), `Mixed regular and slider images should be numbered in document order: ${JSON.stringify(orderedImageOffsets)}`);
  expect(payload.edge.plainText.includes("图片链接：https://example.com/linked-article"), "A linked image placeholder must retain its target URL.");
  expect(payload.edge.imageCount === 3 && payload.edge.stats.preservedWechatImages === 2 && payload.edge.stats.embeddedImages === 1, `WeChat-hosted and embedded images should remain in rich HTML: ${JSON.stringify(payload.edge)}`);
  expect(payload.edge.plainText.includes("【微信图片：Hosted inside slider】") && payload.edge.plainText.includes("【微信图片：Already hosted】"), "Plain-text fallback must describe every preserved WeChat image.");
  expect(payload.edge.plainText.includes("https://mmbiz.qpic.cn/mmbiz_png/example/640?wx_fmt=png") && payload.edge.plainText.includes("https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg"), "Plain-text fallback must retain hosted WeChat image URLs.");
  expect(payload.metadata.title === "WeChat Paste Fixture" && payload.metadata.summary.startsWith("Read the official documentation"), `Title and summary should be extracted for separate WeChat fields: ${JSON.stringify(payload.metadata)}`);
  expect(payload.copyReady.hasControls && payload.copyReady.hasEmbeddedImage && payload.copyReady.hasStyle && !payload.copyReady.hasTitleInBody, `Standalone copy-ready HTML should include the selected style, controls, and embedded images without duplicating H1: ${JSON.stringify(payload.copyReady)}`);
  expect(payload.bundled.embeddedCount === 2 && payload.bundled.compactReferences === 2 && payload.bundled.hydratedImages === 2 && payload.bundled.keepsRemote && payload.bundled.usedAssets === 1, `Markdown + image-folder import should keep compact references, hydrate relative/HTML paths, and leave remote URLs untouched: ${JSON.stringify(payload.bundled)}`);

  await page.evaluate(() => {
    window.__wechatClipboardCapture = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async write(items) {
          const item = items[0];
          const html = await (await item.getType("text/html")).text();
          const plainText = await (await item.getType("text/plain")).text();
          window.__wechatClipboardCapture = { html, plainText, types: item.types };
        },
        async writeText(plainText) {
          window.__wechatClipboardCapture = { html: "", plainText, types: ["text/plain"] };
        },
      },
    });
  });
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"]').getByRole("button", { name: "Copy source", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__wechatClipboardCapture));
  const sourceClipboard = await page.evaluate(() => window.__wechatClipboardCapture);
  expect(sourceClipboard.plainText === "flowchart LR\n  A[Write] --> B[Publish]", "The diagram toolbar should copy the exact editable Mermaid source.");
  await page.evaluate(() => {
    window.__wechatClipboardCapture = null;
    document.execCommand = (command) => {
      if (command !== "copy") return false;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const container = document.createElement("div");
      if (range) container.appendChild(range.cloneContents());
      window.__wechatClipboardCapture = {
        html: container.innerHTML,
        plainText: selection?.toString() || "",
        types: ["text/html", "text/plain"],
      };
      return true;
    };
  });

  await modeBar.getByRole("button", { name: "Copy text + images", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__wechatClipboardCapture));
  const quickClipboard = await page.evaluate(() => window.__wechatClipboardCapture);
  expect(quickClipboard.html.includes("data:image/png;base64,iVBORw0KGgo=") && !quickClipboard.html.includes("<h1"), "The preview one-click action should copy the styled body and embedded image without duplicating the title.");

  await page.evaluate(() => { window.__wechatClipboardCapture = null; });
  await page.locator(".workspace-toolbar").getByRole("button", { name: "WeChat paste", exact: true }).click();
  const publishingKit = page.getByRole("dialog", { name: "WeChat publishing kit" });
  await publishingKit.waitFor({ state: "visible" });
  await takeElementScreenshot(publishingKit, "wechat-publishing-kit.png");
  expect(await publishingKit.getByRole("textbox").first().inputValue() === "WeChat Paste Fixture", "The publishing kit should prefill the H1 as the separate article title.");
  await publishingKit.getByRole("radio", { name: /WeChat fresh/ }).click();
  await page.locator(".preview-article.wechat-style-fresh").waitFor({ state: "visible" });
  const downloadPromise = page.waitForEvent("download");
  await publishingKit.getByRole("button", { name: "Download copy-ready HTML", exact: true }).click();
  const download = await downloadPromise;
  const downloadedHtml = await readFile(await download.path(), "utf8");
  expect(download.suggestedFilename().endsWith(".wechat.html") && downloadedHtml.includes('id="wechat-copy-article"') && downloadedHtml.includes('data-wechat-style="fresh"') && downloadedHtml.includes("data:image/png;base64,iVBORw0KGgo="), "The publishing kit should download a self-contained, style-labelled copy-ready HTML file.");
  await publishingKit.getByRole("button", { name: /Copy body with 1 image/ }).click();
  await page.waitForFunction(() => Boolean(window.__wechatClipboardCapture));
  const clipboard = await page.evaluate(() => window.__wechatClipboardCapture);
  expect(clipboard.types.includes("text/html") && clipboard.types.includes("text/plain"), `Copy action should write both clipboard formats: ${JSON.stringify(clipboard.types)}`);
  expect(!clipboard.html.includes("<h1") && clipboard.html.includes("data:image/png;base64,iVBORw0KGgo=") && clipboard.html.includes("rgb(237, 249, 244)"), "Body copy should omit the separate title while retaining the selected fresh style and embedded image.");
  expect(!clipboard.html.includes("<svg") && !clipboard.html.includes("https://cdn.example.com/architecture.png\""), "Body copy must not reintroduce SVG or third-party image elements.");

  await publishingKit.getByRole("button", { name: /^Close WeChat publishing kit$/ }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  await editor.evaluate((node) => {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  });
  await page.locator(".editor-wrap").evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "dragged-shot.png", { type: "image/png" }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.locator(".editor-drop-hint").waitFor({ state: "visible" });
  await page.locator(".editor-wrap").evaluate((target) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "dragged-shot.png", { type: "image/png" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.waitForFunction(() => {
    const textarea = document.querySelector('textarea[aria-label="Editor"]');
    return textarea instanceof HTMLTextAreaElement && textarea.value.includes("![dragged shot](marcato-asset:");
  });
  const droppedMarkdown = await editor.inputValue();
  expect(/\n\n!\[dragged shot\]\(marcato-asset:[^)]+\)\n\n$/.test(droppedMarkdown), "Dropped images should be inserted as a clean Markdown block with surrounding blank lines.");
  await page.locator('.preview-article img[alt="dragged shot"]').waitFor({ state: "visible" });
  expect(!(await page.locator(".editor-drop-hint").isVisible()), "The editor image drop hint should clear after insertion.");

  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("wechat-export.json", {
    anchors: payload.anchors,
    durationMs: Date.now() - startedAt,
    stats: payload.stats,
    clipboardTypes: clipboard.types,
    quickClipboardTypes: quickClipboard.types,
    selectedStyle,
  });
});

console.log(`WeChat export test passed in ${Date.now() - startedAt}ms.`);
