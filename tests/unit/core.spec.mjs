import { createServer } from "vite";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const editor = await server.ssrLoadModule("/src/lib/editorCommands.ts");
  const find = await server.ssrLoadModule("/src/lib/findReplace.ts");
  const exportNames = await server.ssrLoadModule("/src/lib/exportNames.ts");
  const health = await server.ssrLoadModule("/src/lib/documentHealth.ts");
  const markdown = await server.ssrLoadModule("/src/lib/markdownCore.ts");
  const profiles = await server.ssrLoadModule("/src/lib/professionalProfiles.ts");
  const share = await server.ssrLoadModule("/src/lib/share.ts");

  const heading = editor.applyCommand("Hello", "h4", 0, 5);
  expect(heading.value === "#### Hello", `Expected H4 command, got ${heading.value}`);

  const title = editor.applyCommand("marcato markdown studio", "title", 0, 23);
  expect(title.value === "Marcato Markdown Studio", `Expected title case, got ${title.value}`);

  const table = editor.buildMarkdownTable(2, 1, "center");
  expect(table.includes("| :---: | :---: |"), "Centered table divider was not generated.");

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

  const wechatReport = profiles.analyzeProfessionalProfile("# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$$x$$\n\n```mermaid\ngraph TD\nA-->B\n```", "wechat");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-table"), "WeChat profile should warn about wide tables.");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-math"), "WeChat profile should warn about math paste reliability.");
  expect(wechatReport.issues.some((issue) => issue.code === "wechat-diagram"), "WeChat profile should warn about interactive diagrams.");

  const wechatRender = markdown.renderMarkdownToHtml('<MpProfile mpId="MzIxNjA5ODQ0OQ==" nickname="Doocs" />\n\n<![A](https://example.com/a.png),![B](https://example.com/b.png)>\n\n![Logo|320x120](https://example.com/logo.png)\n\n:::tip\nNo platform mix.\n:::', false, "wechat");
  expect(wechatRender.html.includes("mp-common-profile"), "WeChat MpProfile component should render to the official account card tag.");
  expect(wechatRender.html.includes("wechat-slider"), "WeChat horizontal slider syntax should render.");
  expect(wechatRender.html.includes('width="320"') && wechatRender.html.includes('height="120"'), "WeChat image size suffix should become image dimensions.");
  expect(!wechatRender.html.includes("platform-admonition"), "WeChat profile should not render docs-platform admonitions.");

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
