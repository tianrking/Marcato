import {
  expect,
  expectNoBrowserErrors,
  setMarkdown,
  withApp,
} from "./support.mjs";

await withApp(async ({ consoleMessages, page }) => {
  const editor = await setMarkdown(page, "# Asset persistence failure");
  await editor.evaluate((node) => {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  });
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "markdownViewerAssets") throw new DOMException("quota exceeded", "QuotaExceededError");
      return nativeSetItem.call(this, key, value);
    };
  });

  await page.locator(".editor-wrap").evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "quota-shot.png", { type: "image/png" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });

  await page.locator(".toast").filter({ hasText: "Could not save image assets" }).waitFor({ state: "visible" });
  expect(!(await editor.inputValue()).includes("marcato-asset:"), "A failed asset save must not insert a compact Markdown reference.");
  expect(await page.evaluate(() => localStorage.getItem("markdownViewerAssets")) === null, "A failed asset save must not leave persisted asset data.");

  await page.getByRole("button", { name: "Asset library" }).click();
  const assetLibrary = page.getByRole("dialog", { name: "Asset library" });
  await assetLibrary.getByText("0 images").waitFor({ state: "visible" });
  expectNoBrowserErrors(consoleMessages);
});

await withApp(async ({ consoleMessages, page }) => {
  const editor = await setMarkdown(page, "# Asset capacity");
  await editor.evaluate((node) => {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  });

  await page.locator(".editor-wrap").evaluate((target) => {
    const transfer = new DataTransfer();
    for (let index = 0; index < 45; index += 1) {
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71, index])], `capacity-${index}.png`, { type: "image/png" }));
    }
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });

  await page.locator(".toast").filter({ hasText: "40 images inserted; 5 skipped" }).waitFor({ state: "visible", timeout: 15_000 });
  const result = await page.evaluate(() => {
    const textarea = document.querySelector('textarea[aria-label="Editor"]');
    const markdown = textarea instanceof HTMLTextAreaElement ? textarea.value : "";
    const references = [...markdown.matchAll(/marcato-asset:([a-z0-9-]+)/gi)].map((match) => match[1]);
    const stored = JSON.parse(localStorage.getItem("markdownViewerAssets") || "[]");
    const storedIds = new Set(stored.map((asset) => asset.id));
    return {
      referenceCount: references.length,
      storedCount: stored.length,
      allReferencesStored: references.every((id) => storedIds.has(id)),
    };
  });
  expect(result.referenceCount === 40, `Expected 40 inserted references, got ${result.referenceCount}.`);
  expect(result.storedCount === 40, `Expected 40 persisted assets, got ${result.storedCount}.`);
  expect(result.allReferencesStored, "Every inserted compact reference must resolve to a persisted asset.");

  await page.getByRole("button", { name: "Asset library" }).click();
  const assetLibrary = page.getByRole("dialog", { name: "Asset library" });
  await assetLibrary.getByRole("button", { name: "Remove capacity-0.png" }).click();
  await page.locator(".toast").filter({ hasText: "still referenced by a document" }).waitFor({ state: "visible" });
  expect(await assetLibrary.getByText("40 images").isVisible(), "Referenced assets should remain visible after a blocked removal.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerAssets") || "[]").length) === 40, "Blocked removal should preserve persisted assets.");
  expectNoBrowserErrors(consoleMessages);
});

console.log("Asset integrity browser tests passed.");
