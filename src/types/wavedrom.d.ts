declare module "wavedrom-render-any" {
  export default function renderAny(index: number, source: Record<string, unknown>, waveSkin: unknown, notFirstSignal?: boolean): unknown[];
}

declare module "wavedrom/skins/default.js" {
  const waveSkin: {
    default?: unknown;
  };
  export default waveSkin;
}

declare module "onml/stringify.js" {
  export default function stringify(tree: unknown, indentation?: number): string;
}
