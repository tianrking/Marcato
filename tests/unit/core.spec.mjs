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
  const health = await server.ssrLoadModule("/src/lib/documentHealth.ts");
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

  const report = health.analyzeDocumentHealth("## Jump\n\n[]( )\n\n![ ](x.png)\n```js\nopen");
  expect(report.score < 100, "Health report should detect document issues.");
  expect(report.issues.some((issue) => issue.code === "missingH1"), "Health report should flag missing H1.");
  expect(report.issues.some((issue) => issue.code === "unclosedFence"), "Health report should flag unclosed fences.");

  const encoded = share.encodeShare("# Marcato\n\nHello");
  const decoded = share.decodeShare(encoded);
  expect(decoded === "# Marcato\n\nHello", "Share encode/decode roundtrip failed.");
} finally {
  await server.close();
}

console.log("Core unit tests passed.");
