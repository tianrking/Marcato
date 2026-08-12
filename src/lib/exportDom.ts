const SOLID_COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "text-emphasis-color",
  "column-rule-color",
  "caret-color",
  "fill",
  "stroke",
  "flood-color",
  "lighting-color",
  "stop-color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
] as const;

const COMPLEX_PAINT_PROPERTIES = [
  "background-image",
  "border-image-source",
  "box-shadow",
  "filter",
  "mask-image",
  "text-shadow",
  "-webkit-mask-image",
] as const;

const MODERN_COLOR_FUNCTION = /(?:^|[\s,(])(?:color|color-mix|lab|lch|oklab|oklch)\(/i;
const NON_SOLID_COLOR = /^(?:currentcolor|inherit|initial|none|revert(?:-layer)?|unset)$|^url\(/i;

let colorContext: CanvasRenderingContext2D | null | undefined;

/**
 * html2canvas 1.x cannot parse CSS Color 4 values returned by modern Chromium.
 * Copy the live preview's resolved paint colors onto its structurally identical
 * export clone as legacy rgba() values before either DOM is changed.
 */
export function stabilizeExportDomColors(source: HTMLElement, clone: HTMLElement, options: { omitClasses?: string[] } = {}) {
  const sourceElements = [source, ...source.querySelectorAll<HTMLElement | SVGElement>("*")];
  const cloneElements = [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>("*")];
  const pseudoRules: string[] = [];
  let pseudoId = 0;

  const omittedSourceClasses: Array<[Element, string]> = [];
  for (const className of options.omitClasses || []) {
    sourceElements.forEach((element) => {
      if (!element.classList.contains(className)) return;
      omittedSourceClasses.push([element, className]);
      element.classList.remove(className);
    });
    cloneElements.forEach((element) => element.classList.remove(className));
  }

  try {
    sourceElements.forEach((sourceElement, index) => {
      const cloneElement = cloneElements[index];
      if (!cloneElement) return;
      freezeComputedPaint(getComputedStyle(sourceElement), cloneElement.style);

      let elementPseudoId = "";
      for (const pseudo of ["::before", "::after"] as const) {
        const computed = getComputedStyle(sourceElement, pseudo);
        if (computed.content === "none" || computed.content === "normal") continue;
        const declarations = computedPaintDeclarations(computed);
        if (!declarations.length) continue;
        if (!elementPseudoId) {
          elementPseudoId = String(pseudoId++);
          cloneElement.setAttribute("data-export-paint-id", elementPseudoId);
        }
        pseudoRules.push(`[data-export-paint-id="${elementPseudoId}"]${pseudo}{${declarations.join("")}}`);
      }
    });
  } finally {
    omittedSourceClasses.forEach(([element, className]) => element.classList.add(className));
  }

  if (pseudoRules.length) {
    const style = document.createElement("style");
    style.dataset.exportPaintCompatibility = "true";
    style.textContent = pseudoRules.join("\n");
    clone.prepend(style);
  }
}

function freezeComputedPaint(computed: CSSStyleDeclaration, target: CSSStyleDeclaration) {
  for (const property of SOLID_COLOR_PROPERTIES) {
    const rgba = toLegacyRgba(computed.getPropertyValue(property));
    if (rgba) target.setProperty(property, rgba, "important");
  }
  for (const property of COMPLEX_PAINT_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (MODERN_COLOR_FUNCTION.test(value)) target.setProperty(property, "none", "important");
  }
}

function computedPaintDeclarations(computed: CSSStyleDeclaration) {
  const declarations: string[] = [];
  for (const property of SOLID_COLOR_PROPERTIES) {
    const rgba = toLegacyRgba(computed.getPropertyValue(property));
    if (rgba) declarations.push(`${property}:${rgba}!important;`);
  }
  for (const property of COMPLEX_PAINT_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (MODERN_COLOR_FUNCTION.test(value)) declarations.push(`${property}:none!important;`);
  }
  return declarations;
}

function toLegacyRgba(value: string) {
  const color = value.trim();
  if (!color || NON_SOLID_COLOR.test(color) || !globalThis.CSS?.supports?.("color", color)) return "";
  const context = getColorContext();
  if (!context) return "";
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alphaByte] = context.getImageData(0, 0, 1, 1).data;
  const alpha = Number((alphaByte / 255).toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getColorContext() {
  if (colorContext !== undefined) return colorContext;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  colorContext = canvas.getContext("2d", { willReadFrequently: true });
  return colorContext;
}
