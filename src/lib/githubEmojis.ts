export interface GitHubEmojiEntry {
  name: string;
  search: string;
  shortcode: string;
  url: string;
}

const EMOJI_API_URL = "https://api.github.com/emojis";
const COMMON_EMOJI_SHORTCODES: Record<string, string> = {
  "+1": "👍",
  "-1": "👎",
  rocket: "🚀",
  tada: "🎉",
  sparkles: "✨",
  fire: "🔥",
  bug: "🐛",
  memo: "📝",
  eyes: "👀",
  bulb: "💡",
  zap: "⚡",
  warning: "⚠️",
  white_check_mark: "✅",
  x: "❌",
  heart: "❤️",
  smile: "😄",
  thinking: "🤔",
  construction: "🚧",
};

let emojiPromise: Promise<GitHubEmojiEntry[]> | null = null;
let emojiCache: GitHubEmojiEntry[] | null = null;

export function loadGitHubEmojis() {
  if (emojiCache) return Promise.resolve(emojiCache);
  if (emojiPromise) return emojiPromise;
  emojiPromise = fetch(EMOJI_API_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Emoji request failed (${response.status})`);
      return response.json() as Promise<Record<string, string>>;
    })
    .then((data) => {
      emojiCache = Object.keys(data)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          url: data[name],
          shortcode: `:${name}:`,
          search: `${name} :${name}:`.toLowerCase(),
        }));
      return emojiCache;
    })
    .catch((error) => {
      emojiPromise = null;
      throw error;
    });
  return emojiPromise;
}

export function getCommonGitHubEmoji(name: string) {
  return COMMON_EMOJI_SHORTCODES[name.toLowerCase()] || null;
}
