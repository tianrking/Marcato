export interface DocumentHealthIssue {
  level: "info" | "warning";
  message: string;
}

export interface DocumentHealthReport {
  score: number;
  label: "Strong" | "Good" | "Needs work";
  issues: DocumentHealthIssue[];
  signals: {
    headings: number;
    links: number;
    images: number;
    codeBlocks: number;
  };
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm;
const LINK_PATTERN = /!?\[([^\]]*)\]\(([^)]*)\)/g;
const FENCE_PATTERN = /^```/gm;

export function analyzeDocumentHealth(markdown: string): DocumentHealthReport {
  const issues: DocumentHealthIssue[] = [];
  const headings = [...markdown.matchAll(HEADING_PATTERN)].map((match) => ({
    level: match[1].length,
    text: match[2].trim().replace(/\s+#*$/, ""),
  }));
  const links = [...markdown.matchAll(LINK_PATTERN)];
  const codeBlocks = Math.floor((markdown.match(FENCE_PATTERN) || []).length / 2);
  const images = links.filter((match) => match[0].startsWith("!"));
  const normalLinks = links.filter((match) => !match[0].startsWith("!"));

  if (!headings.some((heading) => heading.level === 1)) {
    issues.push({ level: "warning", message: "Missing an H1 title." });
  }

  const skipped = findSkippedHeadingLevel(headings.map((heading) => heading.level));
  if (skipped) {
    issues.push({ level: "warning", message: `Heading jumps from H${skipped.from} to H${skipped.to}.` });
  }

  const duplicates = findDuplicateHeadings(headings.map((heading) => heading.text));
  if (duplicates.length > 0) {
    issues.push({ level: "info", message: `Duplicate headings: ${duplicates.slice(0, 3).join(", ")}.` });
  }

  const emptyLinks = normalLinks.filter((match) => !match[2].trim()).length;
  if (emptyLinks > 0) {
    issues.push({ level: "warning", message: `${emptyLinks} link${emptyLinks === 1 ? " has" : "s have"} empty targets.` });
  }

  const insecureLinks = normalLinks.filter((match) => /^http:\/\//i.test(match[2].trim())).length;
  if (insecureLinks > 0) {
    issues.push({ level: "info", message: `${insecureLinks} link${insecureLinks === 1 ? " uses" : "s use"} plain HTTP.` });
  }

  const imagesWithoutAlt = images.filter((match) => !match[1].trim()).length;
  if (imagesWithoutAlt > 0) {
    issues.push({ level: "warning", message: `${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? " needs" : "s need"} alt text.` });
  }

  const fenceCount = (markdown.match(FENCE_PATTERN) || []).length;
  if (fenceCount % 2 !== 0) {
    issues.push({ level: "warning", message: "A code fence is not closed." });
  }

  const todos = (markdown.match(/\b(?:TODO|FIXME)\b/gi) || []).length;
  if (todos > 0) {
    issues.push({ level: "info", message: `${todos} TODO/FIXME marker${todos === 1 ? "" : "s"} remain.` });
  }

  const warningCount = issues.filter((issue) => issue.level === "warning").length;
  const score = Math.max(0, 100 - warningCount * 18 - (issues.length - warningCount) * 7);
  const label = score >= 86 ? "Strong" : score >= 68 ? "Good" : "Needs work";

  return {
    score,
    label,
    issues: issues.slice(0, 5),
    signals: {
      headings: headings.length,
      links: normalLinks.length,
      images: images.length,
      codeBlocks,
    },
  };
}

function findSkippedHeadingLevel(levels: number[]) {
  let previous = 0;
  for (const level of levels) {
    if (previous && level > previous + 1) return { from: previous, to: level };
    previous = level;
  }
  return null;
}

function findDuplicateHeadings(headings: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const heading of headings) {
    const normalized = heading.toLowerCase();
    if (seen.has(normalized)) duplicates.add(heading);
    seen.add(normalized);
  }
  return [...duplicates];
}
