export type ExternalAskTarget = "chatgpt" | "claude" | "claudeDesktop" | "perplexity" | "google";

export interface ExternalAskOption {
  id: ExternalAskTarget;
  label: string;
  hint: string;
}

export const EXTERNAL_ASK_OPTIONS: ExternalAskOption[] = [
  { id: "chatgpt", label: "ChatGPT", hint: "Open a new ChatGPT prompt" },
  { id: "claude", label: "Claude", hint: "Open Claude web with a prefilled prompt when supported" },
  { id: "claudeDesktop", label: "Claude Desktop", hint: "Use the official claude:// desktop link" },
  { id: "perplexity", label: "Perplexity", hint: "Ask with web search" },
  { id: "google", label: "Google", hint: "Search the selected text" },
];

export function buildExternalAskPrompt(selection: string, title: string, profile: string) {
  const trimmed = selection.trim();
  const heading = title.trim() || "Untitled document";
  if (!trimmed) {
    return `I am editing a Markdown document named "${heading}" in ${profile} mode. Help me think about what to improve next.`;
  }
  return [
    `I am editing a Markdown document named "${heading}" in ${profile} mode.`,
    "Please help with this selected passage. Explain issues, suggest improvements, and preserve the author's intent:",
    "",
    trimmed,
  ].join("\n");
}

export function buildExternalAskUrl(target: ExternalAskTarget, prompt: string) {
  const query = encodeURIComponent(prompt);
  switch (target) {
    case "chatgpt":
      return `https://chatgpt.com/?q=${query}&hints=search`;
    case "claude":
      return `https://claude.ai/new?q=${query}`;
    case "claudeDesktop":
      return `claude://claude.ai/new?q=${query}`;
    case "perplexity":
      return `https://www.perplexity.ai/search/?q=${query}`;
    case "google":
      return `https://www.google.com/search?q=${query}`;
  }
}
