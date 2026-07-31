import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

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

await withApp(async ({ consoleMessages, page }) => {
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "WeChat Paste Fixture");
  await page.locator('.diagram-viewer[data-diagram-engine="mermaid"] svg').waitFor({ state: "visible", timeout: 20_000 });

  const payload = await page.evaluate(async () => {
    const root = document.querySelector(".preview-article");
    if (!(root instanceof HTMLElement)) throw new Error("Preview article was not available.");
    const { buildWechatClipboardPayload } = await import("/src/lib/wechatExport.ts");
    const built = buildWechatClipboardPayload(root);
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
      <p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg" alt="Already hosted"></p>
    `;
    const edgeBuilt = buildWechatClipboardPayload(edgeRoot);
    const edgeParsed = new DOMParser().parseFromString(edgeBuilt.html, "text/html");
    return {
      anchors,
      bareUrlCount: count(built.plainText, "https://example.com/bare"),
      buttonCount: parsed.querySelectorAll("button").length,
      canvasCount: parsed.querySelectorAll("canvas").length,
      html: built.html,
      imageCount: parsed.querySelectorAll("img").length,
      plainText: built.plainText,
      stats: built.stats,
      svgCount: parsed.querySelectorAll("svg").length,
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
  expect(payload.imageCount === 0, `Third-party, local, and embedded images must become deterministic annotations. Found: ${payload.imageCount}`);
  expect(payload.svgCount === 0 && payload.canvasCount === 0, "Rendered diagrams must not leak SVG/canvas into the WeChat clipboard.");
  expect(payload.buttonCount === 0, "Preview controls must not enter the WeChat clipboard.");
  expect(payload.plainText.includes("【图片 1：Remote architecture】") && payload.plainText.includes("原图：https://cdn.example.com/architecture.png"), "Remote images should keep an insertion note and visible source.");
  expect(payload.plainText.includes("【图片 2：Local cover】") && payload.plainText.includes("./assets/cover.png"), "Local images should keep an insertion note and their original path.");
  expect(payload.plainText.includes("【图片 3：Embedded draft】"), "Embedded images should keep their insertion position.");
  expect(!payload.plainText.includes("iVBORw0KGgo") && !payload.html.includes("iVBORw0KGgo"), "Base64 image payloads must not be copied.");
  expect(payload.plainText.includes("【图表：Mermaid；请在此处手动插入导出的 PNG】"), "Mermaid should produce a visible insertion note.");
  expect(payload.plainText.includes("```mermaid\nflowchart LR\n  A[Write] --> B[Publish]\n```"), "The original Mermaid source should remain directly editable.");
  expect(!payload.plainText.includes("Rendering Mermaid"), "Loading state must not enter the clipboard.");
  expect(payload.plainText.includes("$E=mc^2$") && payload.plainText.includes("```latex\n\\sum_{i=1}^{n} i\n```"), "Inline and block math should retain editable source.");
  expect(payload.stats.imagePlaceholders === 3, `Expected three image placeholders. Stats: ${JSON.stringify(payload.stats)}`);
  expect(payload.stats.diagrams === 1, `Expected one diagram source block. Stats: ${JSON.stringify(payload.stats)}`);
  expect(payload.stats.math === 2, `Expected two editable math fallbacks. Stats: ${JSON.stringify(payload.stats)}`);
  const orderedImageLabels = ["【图片 1：Before slider】", "【图片 2：Inside slider】", "【图片 3：Linked cover】"];
  const orderedImageOffsets = orderedImageLabels.map((label) => payload.edge.plainText.indexOf(label));
  expect(orderedImageOffsets.every((offset, index) => offset >= 0 && (index === 0 || offset > orderedImageOffsets[index - 1])), `Mixed regular and slider images should be numbered in document order: ${JSON.stringify(orderedImageOffsets)}`);
  expect(payload.edge.plainText.includes("图片链接：https://example.com/linked-article"), "A linked image placeholder must retain its target URL.");
  expect(payload.edge.imageCount === 2 && payload.edge.stats.preservedWechatImages === 2, `Already-hosted WeChat images should remain in rich HTML: ${JSON.stringify(payload.edge)}`);
  expect(payload.edge.plainText.includes("【微信图片：Hosted inside slider】") && payload.edge.plainText.includes("【微信图片：Already hosted】"), "Plain-text fallback must describe every preserved WeChat image.");
  expect(payload.edge.plainText.includes("https://mmbiz.qpic.cn/mmbiz_png/example/640?wx_fmt=png") && payload.edge.plainText.includes("https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg"), "Plain-text fallback must retain hosted WeChat image URLs.");

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
  });
  await page.locator(".workspace-toolbar").getByRole("button", { name: "WeChat paste", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__wechatClipboardCapture));
  const clipboard = await page.evaluate(() => window.__wechatClipboardCapture);
  expect(clipboard.types.includes("text/html") && clipboard.types.includes("text/plain"), `Copy action should write both clipboard formats: ${JSON.stringify(clipboard.types)}`);
  expect(clipboard.plainText === payload.plainText, "Toolbar copy should use the verified deterministic WeChat payload.");
  expect(!clipboard.html.includes("<svg") && !clipboard.html.includes("<img"), "Toolbar copy must not reintroduce third-party images or SVG.");

  expectNoBrowserErrors(consoleMessages);
  await writeJsonArtifact("wechat-export.json", {
    anchors: payload.anchors,
    durationMs: Date.now() - startedAt,
    stats: payload.stats,
    clipboardTypes: clipboard.types,
  });
});

console.log(`WeChat export test passed in ${Date.now() - startedAt}ms.`);
