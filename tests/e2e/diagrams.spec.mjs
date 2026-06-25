import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  takeScreenshot,
  waitForPreviewText,
  withApp,
  writeJsonArtifact,
} from "./support.mjs";

const maliciousSvg = (label) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160" viewBox="0 0 360 160" onload="window.__remoteSvgPwned='${label}'">
  <script>window.__remoteSvgPwned='${label}'</script>
  <rect width="360" height="160" rx="12" fill="#f6f8fa" stroke="#2563eb" />
  <a href="javascript:alert('${label}')">
    <text x="28" y="88" font-family="Arial" font-size="28" onclick="window.__remoteSvgPwned='${label}'">${label} sanitized</text>
  </a>
</svg>`;

const fixture = `# Remote Diagram Fixture

\`\`\`plantuml
Alice -> Bob: hello
\`\`\`

\`\`\`d2
author -> preview: render
\`\`\`
`;

const localDiagramFixture = `# Local Diagram Fixture

\`\`\`markmap
# Product Plan
## PDF
- Pagination
- Export progress
## Diagrams
- Local Markmap
- Remote SVG safety
\`\`\`

\`\`\`wavedrom
{ signal: [
  { name: 'clk', wave: 'p.....' },
  { name: 'data', wave: 'x.345x', data: ['A', 'B', 'C'] },
  { name: 'ready', wave: '0.1.0.' }
] }
\`\`\`
`;

const startedAt = Date.now();

await withApp(async ({ consoleMessages, page, server }) => {
  let plantumlRequests = 0;
  let d2Requests = 0;

  await page.route("https://www.plantuml.com/plantuml/svg/**", async (route) => {
    plantumlRequests += 1;
    await route.fulfill({
      body: maliciousSvg("PlantUML"),
      contentType: "image/svg+xml",
      status: 200,
    });
  });

  await page.route("https://plantuml.com/plantuml/svg/**", async (route) => {
    plantumlRequests += 1;
    await route.fulfill({
      body: maliciousSvg("PlantUML fallback"),
      contentType: "image/svg+xml",
      status: 200,
    });
  });

  await page.route("https://kroki.io/d2/svg/**", async (route) => {
    d2Requests += 1;
    if (d2Requests === 1) {
      await route.fulfill({ body: "temporary failure", contentType: "text/plain", status: 503 });
      return;
    }
    await route.fulfill({
      body: maliciousSvg("D2"),
      contentType: "image/svg+xml",
      status: 200,
    });
  });

  await setMarkdown(page, localDiagramFixture);
  await waitForPreviewText(page, "Local Diagram Fixture");
  await page.locator('.diagram-viewer[data-diagram-engine="markmap"] svg.markmap-svg').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('.diagram-viewer[data-diagram-engine="wavedrom"] svg.wavedrom-svg').waitFor({ state: "visible", timeout: 20_000 });
  const markmapChecks = await page.evaluate(() => {
    const viewer = document.querySelector('.diagram-viewer[data-diagram-engine="markmap"]');
    const svg = viewer?.querySelector("svg.markmap-svg");
    return {
      fallback: viewer?.classList.contains("is-fallback") || false,
      ready: !viewer?.classList.contains("is-loading") && !viewer?.classList.contains("is-error"),
      rendered: viewer?.querySelector(".diagram-surface")?.getAttribute("data-rendered"),
      text: svg?.textContent?.replace(/\s+/g, " ").trim() || "",
    };
  });
  const wavedromChecks = await page.evaluate(() => {
    const viewer = document.querySelector('.diagram-viewer[data-diagram-engine="wavedrom"]');
    const svg = viewer?.querySelector("svg.wavedrom-svg");
    return {
      fallback: viewer?.classList.contains("is-fallback") || false,
      ready: !viewer?.classList.contains("is-loading") && !viewer?.classList.contains("is-error"),
      rendered: viewer?.querySelector(".diagram-surface")?.getAttribute("data-rendered"),
      hasWaveDromClass: svg?.classList.contains("WaveDrom") || false,
      text: svg?.textContent?.replace(/\s+/g, " ").trim() || "",
    };
  });
  expect(markmapChecks.ready, `Local Markmap should be ready. Checks: ${JSON.stringify(markmapChecks)}`);
  expect(!markmapChecks.fallback, `Local Markmap should not use remote fallback. Checks: ${JSON.stringify(markmapChecks)}`);
  expect(markmapChecks.rendered === "1", `Local Markmap surface should be marked rendered. Checks: ${JSON.stringify(markmapChecks)}`);
  expect(markmapChecks.text.includes("Product Plan") && markmapChecks.text.includes("Local Markmap"), `Local Markmap text missing. Checks: ${JSON.stringify(markmapChecks)}`);
  expect(wavedromChecks.ready, `Local WaveDrom should be ready. Checks: ${JSON.stringify(wavedromChecks)}`);
  expect(!wavedromChecks.fallback, `Local WaveDrom should not use remote fallback. Checks: ${JSON.stringify(wavedromChecks)}`);
  expect(wavedromChecks.rendered === "1", `Local WaveDrom surface should be marked rendered. Checks: ${JSON.stringify(wavedromChecks)}`);
  expect(wavedromChecks.hasWaveDromClass, `Local WaveDrom SVG class missing. Checks: ${JSON.stringify(wavedromChecks)}`);
  expect(wavedromChecks.text.includes("clk") && wavedromChecks.text.includes("data") && wavedromChecks.text.includes("ready"), `Local WaveDrom text missing. Checks: ${JSON.stringify(wavedromChecks)}`);

  await page.getByLabel("Offline first").uncheck();
  await setMarkdown(page, fixture);
  await waitForPreviewText(page, "Remote Diagram Fixture");
  await page.locator('.diagram-viewer[data-diagram-engine="plantuml"] svg').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('.diagram-viewer[data-diagram-engine="d2"] svg').waitFor({ state: "visible", timeout: 20_000 });

  const checks = await page.evaluate(async () => {
    const { normalizeRemoteDiagramCode } = await import("/src/lib/diagramRenderers.ts");
    const surfaces = Array.from(document.querySelectorAll(".diagram-surface"));
    return {
      normalizedPlantUml: normalizeRemoteDiagramCode("plantuml", "Alice -> Bob: hello"),
      normalizedD2: normalizeRemoteDiagramCode("d2", "```d2\na -> b\n```"),
      pwned: window.__remoteSvgPwned || null,
      scriptCount: document.querySelectorAll(".diagram-surface script").length,
      eventAttrs: surfaces.flatMap((surface) => Array.from(surface.querySelectorAll("*")).flatMap((node) => Array.from(node.attributes).filter((attr) => /^on/i.test(attr.name)).map((attr) => attr.name))),
      javascriptHrefs: surfaces.flatMap((surface) => Array.from(surface.querySelectorAll("[href]")).map((node) => node.getAttribute("href")).filter((href) => href?.trim().toLowerCase().startsWith("javascript:"))),
      renderedText: surfaces.map((surface) => surface.textContent?.replace(/\s+/g, " ").trim()),
    };
  });

  expect(plantumlRequests === 1, `Expected one PlantUML request. Got ${plantumlRequests}.`);
  expect(d2Requests === 2, `Expected D2 to retry after a 503. Got ${d2Requests}.`);
  expect(checks.normalizedPlantUml.startsWith("@startuml\n"), `PlantUML source was not normalized: ${checks.normalizedPlantUml}`);
  expect(checks.normalizedPlantUml.endsWith("\n@enduml"), `PlantUML source was not closed: ${checks.normalizedPlantUml}`);
  expect(checks.normalizedD2 === "a -> b", `D2 fenced source was not normalized: ${checks.normalizedD2}`);
  expect(checks.pwned === null, `Remote SVG script/event handler executed: ${checks.pwned}`);
  expect(checks.scriptCount === 0, `Remote SVG script tags were not removed: ${checks.scriptCount}`);
  expect(checks.eventAttrs.length === 0, `Remote SVG event attributes were not removed: ${checks.eventAttrs.join(", ")}`);
  expect(checks.javascriptHrefs.length === 0, `Remote SVG javascript hrefs were not removed: ${checks.javascriptHrefs.join(", ")}`);
  expect(checks.renderedText.some((text) => text?.includes("PlantUML sanitized")), "Sanitized PlantUML SVG did not render.");
  expect(checks.renderedText.some((text) => text?.includes("D2 sanitized")), "Sanitized D2 SVG did not render after retry.");

  await takeScreenshot(page, "diagrams-sanitized-and-local.png");
  expectNoBrowserErrors(consoleMessages.filter((message) => !message.includes("503")));
  await writeJsonArtifact("diagrams.json", {
    baseUrl: server.baseUrl,
    durationMs: Date.now() - startedAt,
    d2Requests,
    markmapChecks,
    plantumlRequests,
    wavedromChecks,
    checks,
    consoleMessages,
  });
});

console.log(`Diagram test passed in ${Date.now() - startedAt}ms.`);
