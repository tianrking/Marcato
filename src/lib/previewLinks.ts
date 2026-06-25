export function setupPreviewLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (link.dataset.previewLinkBound === "1") return;
    link.dataset.previewLinkBound = "1";

    if (href.startsWith("#")) {
      link.addEventListener("click", (event) => {
        const target = findPreviewAnchorTarget(root, href);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (!isSafePreviewHref(href)) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.addEventListener("click", (event) => event.preventDefault());
      return;
    }

    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(new URL(href, window.location.href).href, "_blank", "noopener,noreferrer");
    });
    if (/^(?:https?:|mailto:|tel:|blob:)/i.test(href) || !/^[a-z][a-z\d+.-]*:/i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function isSafePreviewHref(href: string) {
  if (!href.trim()) return false;
  try {
    const parsed = new URL(href, window.location.href);
    return ["http:", "https:", "mailto:", "tel:", "blob:"].includes(parsed.protocol);
  } catch {
    return !href.trim().toLowerCase().startsWith("javascript:");
  }
}

function findPreviewAnchorTarget(root: HTMLElement, href: string) {
  let targetId = "";
  try {
    targetId = decodeURIComponent(href.slice(1));
  } catch {
    targetId = href.slice(1);
  }
  if (!targetId) return null;
  try {
    const escaped = CSS.escape(targetId);
    const exact = root.querySelector<HTMLElement>(`[id="${escaped}"],[name="${escaped}"]`);
    if (exact) return exact;
  } catch {
    const exact = [...root.querySelectorAll<HTMLElement>("[id],[name]")]
      .find((element) => element.id === targetId || element.getAttribute("name") === targetId);
    if (exact) return exact;
  }
  const cleanTarget = normalizeAnchorText(targetId);
  if (!cleanTarget) return null;
  return [...root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")]
    .find((heading) => normalizeAnchorText(heading.textContent || "") === cleanTarget) || null;
}

function normalizeAnchorText(value: string) {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
}
