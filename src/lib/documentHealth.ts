export interface DocumentHealthIssue {
  level: "info" | "warning";
  code: DocumentHealthIssueCode;
  line?: number;
  params?: Record<string, string | number>;
}

export type DocumentHealthIssueCode =
  | "missingH1"
  | "headingJump"
  | "duplicateHeadings"
  | "emptyLinks"
  | "insecureLinks"
  | "missingImageAlt"
  | "unclosedFence"
  | "todoMarkers";

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
    line: lineNumberAt(markdown, match.index ?? 0),
    level: match[1].length,
    text: match[2].trim().replace(/\s+#*$/, ""),
  }));
  const links = [...markdown.matchAll(LINK_PATTERN)];
  const codeBlocks = Math.floor((markdown.match(FENCE_PATTERN) || []).length / 2);
  const images = links.filter((match) => match[0].startsWith("!"));
  const normalLinks = links.filter((match) => !match[0].startsWith("!"));

  if (!headings.some((heading) => heading.level === 1)) {
    issues.push({ level: "warning", code: "missingH1", line: 1 });
  }

  const skipped = findSkippedHeadingLevel(headings);
  if (skipped) {
    issues.push({ level: "warning", code: "headingJump", line: skipped.line, params: { from: skipped.from, to: skipped.to } });
  }

  const duplicates = findDuplicateHeadings(headings);
  if (duplicates.length > 0) {
    issues.push({ level: "info", code: "duplicateHeadings", line: duplicates[0].line, params: { headings: duplicates.slice(0, 3).map((heading) => heading.text).join(", ") } });
  }

  const emptyLinks = normalLinks.filter((match) => !match[2].trim());
  if (emptyLinks.length > 0) {
    issues.push({ level: "warning", code: "emptyLinks", line: lineNumberAt(markdown, emptyLinks[0].index ?? 0), params: { count: emptyLinks.length } });
  }

  const insecureLinks = normalLinks.filter((match) => /^http:\/\//i.test(match[2].trim()));
  if (insecureLinks.length > 0) {
    issues.push({ level: "info", code: "insecureLinks", line: lineNumberAt(markdown, insecureLinks[0].index ?? 0), params: { count: insecureLinks.length } });
  }

  const imagesWithoutAlt = images.filter((match) => !match[1].trim());
  if (imagesWithoutAlt.length > 0) {
    issues.push({ level: "warning", code: "missingImageAlt", line: lineNumberAt(markdown, imagesWithoutAlt[0].index ?? 0), params: { count: imagesWithoutAlt.length } });
  }

  const fences = [...markdown.matchAll(FENCE_PATTERN)];
  const fenceCount = fences.length;
  if (fenceCount % 2 !== 0) {
    issues.push({ level: "warning", code: "unclosedFence", line: lineNumberAt(markdown, fences[fences.length - 1].index ?? 0) });
  }

  const todos = [...markdown.matchAll(/\b(?:TODO|FIXME)\b/gi)];
  if (todos.length > 0) {
    issues.push({ level: "info", code: "todoMarkers", line: lineNumberAt(markdown, todos[0].index ?? 0), params: { count: todos.length } });
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

function findSkippedHeadingLevel(headings: { level: number; line: number }[]) {
  let previous = 0;
  for (const heading of headings) {
    if (previous && heading.level > previous + 1) return { from: previous, to: heading.level, line: heading.line };
    previous = heading.level;
  }
  return null;
}

function findDuplicateHeadings(headings: { text: string; line: number }[]) {
  const seen = new Set<string>();
  const duplicates: { text: string; line: number }[] = [];
  for (const heading of headings) {
    const normalized = heading.text.toLowerCase();
    if (seen.has(normalized) && !duplicates.some((duplicate) => duplicate.text.toLowerCase() === normalized)) {
      duplicates.push(heading);
    }
    seen.add(normalized);
  }
  return duplicates;
}

function lineNumberAt(markdown: string, index: number) {
  return markdown.slice(0, index).split(/\r\n|\r|\n/).length;
}
