import {
  expect,
  expectNoBrowserErrors,
  withApp,
} from "./support.mjs";

const initialTab = {
  id: "tab-history-fresh",
  title: "Fresh.md",
  content: "",
  createdAt: 1,
  updatedAt: 1,
  history: [""],
  historyIndex: 0,
};

await withApp(async ({ consoleMessages, page }) => {
  const editor = page.locator(".editor-pane textarea").first();
  await editor.waitFor({ state: "visible" });

  await editor.type("hello");
  expect(await editor.inputValue() === "hello", "Typing should update a fresh document.");

  await page.keyboard.press("ControlOrMeta+z");
  expect(await editor.inputValue() === "", "Cmd/Ctrl+Z should undo the first typing batch without requiring blur.");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await editor.inputValue() === "hello", "Cmd/Ctrl+Shift+Z should redo the first typing batch.");

  await page.getByRole("button", { name: "Bold" }).click();
  const boldValue = await editor.inputValue();
  expect(boldValue === "hello**bold text**", `A toolbar command should apply after typing. Got: ${JSON.stringify(boldValue)}`);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await editor.inputValue() === "hello", "Undo should remove a command while retaining the preceding typing batch.");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await editor.inputValue() === "", "The next undo should remove the coalesced typing batch.");
  await page.keyboard.press("ControlOrMeta+y");
  expect(await editor.inputValue() === "hello", "Cmd/Ctrl+Y should redo the typing batch.");

  await page.getByRole("button", { name: "New tab" }).click();
  const secondEditor = page.locator(".editor-pane textarea").first();
  await secondEditor.type("second");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await secondEditor.inputValue() === "", "Undo in a second tab should use that tab's history.");

  await page.getByRole("tab", { name: "Fresh.md" }).click();
  expect(await editor.inputValue() === "hello", "Switching tabs should preserve the first tab's history position.");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await editor.inputValue() === boldValue, "Redo in the first tab should remain available after editing another tab.");

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]"));
  const fresh = stored.find((tab) => tab.id === "tab-history-fresh");
  expect(fresh?.history?.join("|") === `|hello|${boldValue}`, `Persisted history should include initial, typing, and command snapshots: ${JSON.stringify(fresh)}`);
  expectNoBrowserErrors(consoleMessages);
}, {
  localStorage: {
    markdownViewerTabs: JSON.stringify([initialTab]),
    markdownViewerActiveTab: initialTab.id,
    markdownViewerUntitledCounter: "1",
  },
});

await withApp(async ({ consoleMessages, page }) => {
  const editor = page.locator(".editor-pane textarea").first();
  await editor.waitFor({ state: "visible" });
  const persistedBeforeFailure = await page.evaluate(() => localStorage.getItem("markdownViewerTabs"));

  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "markdownViewerTabs") throw new DOMException("quota exceeded", "QuotaExceededError");
      return nativeSetItem.call(this, key, value);
    };
  });

  await editor.fill("kept in memory despite quota failure");
  await page.locator(".toast")
    .filter({ hasText: "browser storage is unavailable or full" })
    .waitFor({ state: "visible" });
  expect(await editor.inputValue() === "kept in memory despite quota failure", "A persistence failure interrupted in-memory editing.");
  expect(await page.evaluate(() => localStorage.getItem("markdownViewerTabs")) === persistedBeforeFailure, "A failed workspace write partially replaced the persisted tabs payload.");
  expectNoBrowserErrors(consoleMessages);
}, {
  localStorage: {
    markdownViewerTabs: JSON.stringify([initialTab]),
    markdownViewerActiveTab: initialTab.id,
    markdownViewerUntitledCounter: "1",
  },
});

console.log("Editor history browser regression passed.");
