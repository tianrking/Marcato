import { createServer } from "vite";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectThrows(callback, message) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const editor = await server.ssrLoadModule("/src/lib/editorCommands.ts");
  const editHistory = await server.ssrLoadModule("/src/lib/editHistory.ts");
  const find = await server.ssrLoadModule("/src/lib/findReplace.ts");
  const exportNames = await server.ssrLoadModule("/src/lib/exportNames.ts");
  const health = await server.ssrLoadModule("/src/lib/documentHealth.ts");
  const markdown = await server.ssrLoadModule("/src/lib/markdownCore.ts");
  const profiles = await server.ssrLoadModule("/src/lib/professionalProfiles.ts");
  const share = await server.ssrLoadModule("/src/lib/share.ts");
  const externalAsk = await server.ssrLoadModule("/src/lib/externalAsk.ts");

  const heading = editor.applyCommand("Hello", "h4", 0, 5);
  expect(heading.value === "#### Hello", `Expected H4 command, got ${heading.value}`);

  const title = editor.applyCommand("marcato markdown studio", "title", 0, 23);
  expect(title.value === "Marcato Markdown Studio", `Expected title case, got ${title.value}`);

  const table = editor.buildMarkdownTable(2, 1, "center");
  expect(table.includes("| :---: | :---: |"), "Centered table divider was not generated.");

  const fresh = { content: "", history: [""], historyIndex: 0 };
  const firstInput = editHistory.recordEdit(fresh, "h", { mode: "input", inputType: "insertText", now: 100 });
  const typedWord = editHistory.recordEdit(firstInput.state, "hello", { mode: "input", inputType: "insertText", batch: firstInput.batch, now: 400 });
  expect(typedWord.state.history.length === 2, "Continuous typing should coalesce into one history entry.");
  expect(editHistory.undoEdit(typedWord.state).content === "", "The first typing batch in an empty document should undo to the initial content.");
  expect(editHistory.redoEdit(editHistory.undoEdit(typedWord.state)).content === "hello", "A typing batch should be redoable.");

  const commandEdit = editHistory.recordEdit(typedWord.state, "**hello**", { mode: "commit" });
  expect(commandEdit.state.history.length === 3, "An explicit editor command should create a separate undo snapshot.");
  expect(editHistory.undoEdit(commandEdit.state).content === "hello", "Undoing an editor command should preserve the preceding typing batch.");

  const branched = editHistory.recordEdit(editHistory.undoEdit(commandEdit.state), "hello!", { mode: "input", inputType: "insertText", now: 2_000 });
  expect(branched.state.history.length === 3 && branched.state.history.at(-1) === "hello!", "Editing after undo should replace the abandoned redo branch.");
  expect(editHistory.redoEdit(branched.state).content === "hello!", "Redo should not resurrect an abandoned branch.");

  const secondTab = editHistory.recordEdit({ content: "second", history: ["second"], historyIndex: 0 }, "second tab", { mode: "input", inputType: "insertText", now: 100 });
  expect(editHistory.undoEdit(typedWord.state).content === "", "The first tab should keep its independent history.");
  expect(editHistory.undoEdit(secondTab.state).content === "second", "The second tab should keep its independent history.");

  const legacyLiveEdit = editHistory.reconcileHistory({ content: "unsnapshotted", history: ["saved"], historyIndex: 0 });
  expect(legacyLiveEdit.history.join("|") === "saved|unsnapshotted", "Legacy live content should be repaired into history.");
  expect(editHistory.undoEdit(legacyLiveEdit).content === "saved", "Repaired legacy content should be immediately undoable.");

  const budgetEntrySize = 80 * 1024;
  const oversizedHistory = Array.from({ length: 20 }, (_, index) => `${index}:`.padEnd(budgetEntrySize, String(index % 10)));
  const budgetedHistory = editHistory.reconcileHistory({
    content: oversizedHistory.at(-1),
    history: oversizedHistory,
    historyIndex: oversizedHistory.length - 1,
  });
  const budgetedCharacters = budgetedHistory.history.reduce((total, entry) => total + entry.length, 0);
  expect(budgetedCharacters <= editHistory.MAX_HISTORY_CHARACTERS, `History exceeded its character budget: ${budgetedCharacters}.`);
  expect(budgetedHistory.history.at(-1) === oversizedHistory.at(-1), "Budget trimming discarded the current snapshot.");
  expect(editHistory.undoEdit(budgetedHistory).content === oversizedHistory.at(-2), "Budget trimming discarded the nearest undo snapshot.");

  const largeUndo = "A".repeat(400 * 1024);
  const largeRedo = "B".repeat(400 * 1024);
  const largePair = editHistory.reconcileHistory({
    content: largeRedo,
    history: [largeUndo, largeRedo],
    historyIndex: 1,
  });
  const undoneLargePair = editHistory.undoEdit(largePair);
  expect(undoneLargePair.content === largeUndo, "Large-document undo did not reach the previous snapshot.");
  expect(editHistory.redoEdit(undoneLargePair).content === largeRedo, "History budgeting discarded the immediate large-document redo target.");

  const entryLimitedHistory = Array.from({ length: editHistory.MAX_HISTORY_ENTRIES + 20 }, (_, index) => `entry-${index}`);
  const entryLimited = editHistory.reconcileHistory({
    content: entryLimitedHistory.at(-1),
    history: entryLimitedHistory,
    historyIndex: entryLimitedHistory.length - 1,
  });
  expect(entryLimited.history.length === editHistory.MAX_HISTORY_ENTRIES, "History entry trimming no longer enforces the entry limit.");
  expect(entryLimited.history.at(-1) === entryLimitedHistory.at(-1), "Entry trimming discarded the selected snapshot.");

  const options = {
    caseSensitive: false,
    inSelection: false,
    preserveCase: true,
    query: "marcato",
    regex: false,
    replacement: "studio",
    scope: "document",
    wholeWord: true,
  };
  const matches = find.findMatches("Marcato marcato MARCATO", options);
  expect(matches.length === 3, `Expected 3 find matches, got ${matches.length}`);
  expect(find.replaceAll("Marcato marcato MARCATO", matches, options) === "Studio studio STUDIO", "Preserve-case replaceAll regressed.");
  expect(find.buildDiffPreview("Marcato marcato", matches, options).length > 0, "Diff preview should include items.");

  expect(exportNames.getExportName("Release Notes.md") === "release-notes", "Export names should strip Markdown extensions.");
  expect(exportNames.getExportName("My: Unsafe/File.txt") === "my-unsafe-file", "Export names should sanitize unsafe filename characters.");

  const report = health.analyzeDocumentHealth("## Jump\n\n[]( )\n\n![ ](x.png)\n```js\nopen");
  expect(report.score < 100, "Health report should detect document issues.");
  expect(report.issues.some((issue) => issue.code === "missingH1"), "Health report should flag missing H1.");
  expect(report.issues.some((issue) => issue.code === "unclosedFence"), "Health report should flag unclosed fences.");

  const encoded = share.encodeShare("# Marcato\n\nHello");
  const decoded = share.decodeShare(encoded);
  expect(decoded === "# Marcato\n\nHello", "Share encode/decode roundtrip failed.");
  const compressedOverflow = Buffer.concat([Buffer.from(encoded, "base64url"), Buffer.alloc(256 * 1024)]).toString("base64url");
  expectThrows(() => share.decodeShare(compressedOverflow), "Share decoder accepted an oversized compressed payload.");
  const decompressionBomb = share.encodeShare("A".repeat(10 * 1024 * 1024 + 1));
  expectThrows(() => share.decodeShare(decompressionBomb), "Share decoder accepted output beyond the decompressed size limit.");

  const askPrompt = externalAsk.buildExternalAskPrompt("tighten this paragraph", "Draft.md", "wechat");
  expect(askPrompt.includes("Draft.md") && askPrompt.includes("tighten this paragraph"), "External ask prompt should include document and selection context.");
  expect(externalAsk.buildExternalAskUrl("chatgpt", askPrompt).startsWith("https://chatgpt.com/?q="), "ChatGPT ask URL should be generated.");
  expect(externalAsk.buildExternalAskUrl("claudeDesktop", askPrompt).startsWith("claude://claude.ai/new?q="), "Claude Desktop URL should use the official URI scheme.");

  const wechatReport = profiles.analyzeProfessionalProfile("# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$$x$$\n\n```mermaid\ngraph TD\nA-->B\n```", "wechat");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-table"), "WeChat profile should warn about wide tables.");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-math"), "WeChat profile should warn about math paste reliability.");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-diagram"), "WeChat profile should warn about interactive diagrams.");
  const wechatAssetReport = profiles.analyzeProfessionalProfile("---\ntitle: Draft\n---\n\n# Draft\n\n![Local](./cover.png)\n\n![Embedded](data:image/png;base64,abc)", "wechat");
  expect(wechatAssetReport.issues.some((issue) => issue.code === "wechat-local-image"), "WeChat profile should warn about local image paths.");
  expect(wechatAssetReport.issues.some((issue) => issue.code === "wechat-embedded-image"), "WeChat profile should warn about embedded image drafts.");
  expect(wechatAssetReport.issues.some((issue) => issue.code === "wechat-cover"), "WeChat profile should suggest a cover field.");
  expect(wechatAssetReport.issues.some((issue) => issue.code === "wechat-summary"), "WeChat profile should suggest a summary or digest field.");

  const wechatRender = markdown.renderMarkdownToHtml('<MpProfile mpId="MzIxNjA5ODQ0OQ==" nickname="Doocs" />\n\n<![A](https://example.com/a.png),![B](https://example.com/b.png)>\n\n![Logo|320x120](https://example.com/logo.png)\n\n:::tip\nNo platform mix.\n:::', false, "wechat");
  expect(wechatRender.html.includes("mp-common-profile"), "WeChat MpProfile component should render to the official account card tag.");
  expect(wechatRender.html.includes("wechat-slider"), "WeChat horizontal slider syntax should render.");
  expect(wechatRender.html.includes('width="320"') && wechatRender.html.includes('height="120"'), "WeChat image size suffix should become image dimensions.");
  expect(!wechatRender.html.includes("platform-admonition"), "WeChat profile should not render docs-platform admonitions.");
  const wechatChineseStrong = markdown.renderMarkdownToHtml('> **先说结论：**正文继续', false, "wechat");
  expect(wechatChineseStrong.html.includes("<strong>先说结论：</strong> 正文继续"), "WeChat profile should repair strong emphasis immediately followed by CJK text.");

  const unicodeFootnotes = markdown.renderMarkdownToHtml("中文脚注[^说明]，再次引用[^说明]，以及另一个[^详情]。\n\n[^说明]: 第一条注释。\n[^详情]: 第二条注释。", false, "standard");
  expect(unicodeFootnotes.html.includes('href="#fn-footnote-1"'), "Unicode footnote references should target a stable fallback ID.");
  expect(unicodeFootnotes.html.includes('id="fn-footnote-1"'), "Unicode footnote definitions should reuse the reference fallback ID.");
  expect(unicodeFootnotes.html.includes('id="fn-footnote-2"'), "Distinct Unicode footnotes should receive distinct fallback IDs.");
  expect(unicodeFootnotes.html.includes('id="fnref-footnote-1-2"'), "Repeated Unicode footnote references should remain uniquely addressable.");

  const collidingFootnotes = markdown.renderMarkdownToHtml("One[^A B] and two[^a-b].\n\n[^A B]: First.\n[^a-b]: Second.", false, "standard");
  expect(collidingFootnotes.html.includes('id="fn-a-b"'), "The first normalized footnote ID should retain its readable slug.");
  expect(collidingFootnotes.html.includes('id="fn-a-b-2"'), "Colliding normalized footnote IDs should be disambiguated.");

  const standardRender = markdown.renderMarkdownToHtml('<MpProfile mpId="x" nickname="Nope" />\n\n:::tip\nNo platform mix.\n:::', false, "standard");
  expect(!standardRender.html.includes("mp-common-profile"), "Standard profile should not render WeChat official account cards.");
  expect(!standardRender.html.includes("platform-admonition"), "Standard profile should not render platform containers.");

  const docusaurusRender = markdown.renderMarkdownToHtml(':::tip[Ship it]\nDocusaurus container.\n:::\n\nimport Tabs from "@theme/Tabs"\n\n<Tabs>\n<TabItem value="one" label="One">\nTab body\n</TabItem>\n</Tabs>\n\n{{< figure src="/img/a.png" >}}', false, "docusaurus");
  expect(docusaurusRender.html.includes("platform-admonition-tip"), "Docusaurus containers should render in Docusaurus mode.");
  expect(docusaurusRender.html.includes("platform-tabs"), "Docusaurus Tabs should render in Docusaurus mode.");
  expect(!docusaurusRender.html.includes("platform-shortcode-figure"), "Docusaurus mode should not render Hugo shortcodes.");

  const vitepressRender = markdown.renderMarkdownToHtml(':::warning\nVitePress container.\n:::', false, "vitepress");
  expect(vitepressRender.html.includes("platform-admonition-warning"), "VitePress containers should render in VitePress mode.");

  const mkdocsRender = markdown.renderMarkdownToHtml('!!! warning "MkDocs"\n    Material admonition.\n\n:::tip\nNo mix.\n:::', false, "mkdocs");
  expect(mkdocsRender.html.includes("platform-admonition-warning"), "MkDocs admonitions should render in MkDocs mode.");
  expect(!mkdocsRender.html.includes("platform-admonition-tip"), "MkDocs mode should not render colon containers.");

  const hugoRender = markdown.renderMarkdownToHtml('{{< figure src="/img/a.png" title="Hugo Figure" >}}\n\n{% include callout.html text="Jekyll" %}', false, "hugo");
  expect(hugoRender.html.includes("platform-shortcode-figure"), "Hugo figure shortcode should render in Hugo mode.");
  expect(!hugoRender.html.includes("platform-liquid"), "Hugo mode should not render Jekyll Liquid directives.");

  const jekyllRender = markdown.renderMarkdownToHtml('{% include callout.html text="Jekyll" %}\n\n{% highlight js %}\nconsole.log("ok")\n{% endhighlight %}\n\n{{< figure src="/img/a.png" >}}', false, "jekyll");
  expect(jekyllRender.html.includes("platform-liquid"), "Jekyll/Liquid tags should render in Jekyll mode.");
  expect(jekyllRender.html.includes("platform-liquid-highlight"), "Liquid highlight blocks should render in Jekyll mode.");
  expect(!jekyllRender.html.includes("platform-shortcode-figure"), "Jekyll mode should not render Hugo shortcodes.");

  const astroRenderCore = markdown.renderMarkdownToHtml('import Card from "./Card.astro"\n\n<Card />\n\n{{< figure src="/img/a.png" >}}', false, "astro");
  expect(astroRenderCore.html.includes("platform-mdx"), "Astro mode should render MDX module directives.");
  expect(astroRenderCore.html.includes("platform-component"), "Astro mode should render component placeholders.");
  expect(!astroRenderCore.html.includes("platform-shortcode-figure"), "Astro mode should not render Hugo shortcodes.");

  const githubReport = profiles.analyzeProfessionalProfile("# Title\n\n```plantuml\nA -> B\n```\n\n:::note\nDocusaurus note\n:::", "github");
  expect(githubReport.issues.some((issue) => issue.code === "github-rich-fence"), "GitHub profile should warn about Marcato-only rich fences.");
  expect(githubReport.issues.some((issue) => issue.code === "github-docusaurus-container"), "GitHub profile should warn about Docusaurus containers.");

  const docusaurusReport = profiles.analyzeProfessionalProfile("---\ntitle: Docs\n---\n\n<Tabs>\n<TabItem value=\"a\" label=\"A\">A</TabItem>\n</Tabs>", "docusaurus");
  expect(docusaurusReport.issues.some((issue) => issue.code === "docusaurus-description"), "Docusaurus profile should suggest description metadata.");
  expect(docusaurusReport.issues.some((issue) => issue.code === "docusaurus-tabs-import"), "Docusaurus profile should warn about missing Tabs imports.");

  const hugoReport = profiles.analyzeProfessionalProfile("---\ntitle: Post\ndraft: true\n---\n\n{{< figure src=\"/a.png\" >}}", "hugo");
  expect(hugoReport.issues.some((issue) => issue.code === "hugo-date"), "Hugo profile should suggest date metadata.");
  expect(hugoReport.issues.some((issue) => issue.code === "hugo-draft"), "Hugo profile should warn about draft posts.");

  const jekyllReport = profiles.analyzeProfessionalProfile("---\ntitle: Page\n---\n\n{% include note.html %}", "jekyll");
  expect(jekyllReport.issues.some((issue) => issue.code === "jekyll-layout"), "Jekyll profile should suggest layout metadata.");

  const astroReport = profiles.analyzeProfessionalProfile("---\ntitle: Page\n---\n\nimport Card from './Card.astro'\n\n<Card />", "astro");
  expect(astroReport.issues.some((issue) => issue.code === "astro-description"), "Astro profile should suggest description metadata.");
} finally {
  await server.close();
}

console.log("Core unit tests passed.");
