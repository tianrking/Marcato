import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Modal } from "./Common";
import { loadGitHubEmojis, type GitHubEmojiEntry } from "../lib/githubEmojis";

const CHUNK_SIZE = 160;

export function EmojiInsertModal({ onClose, onInsert }: { onClose: () => void; onInsert: (shortcodes: string[]) => void }) {
  const [copied, setCopied] = useState("");
  const [entries, setEntries] = useState<GitHubEmojiEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(CHUNK_SIZE);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadGitHubEmojis()
      .then((loaded) => {
        if (cancelled) return;
        setEntries(loaded);
        setError("");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setEntries([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load emojis.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => setVisibleLimit(CHUNK_SIZE), [query]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => !needle || entry.search.includes(needle));
  }, [entries, query]);

  const visibleEntries = filtered.slice(0, visibleLimit);
  const orderedSelection = entries.filter((entry) => selected.has(entry.shortcode)).map((entry) => entry.shortcode);

  const toggle = (shortcode: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(shortcode)) next.delete(shortcode);
      else next.add(shortcode);
      return next;
    });
  };

  const copyShortcode = async (shortcode: string) => {
    await navigator.clipboard.writeText(shortcode);
    setCopied(shortcode);
    window.setTimeout(() => setCopied((current) => (current === shortcode ? "" : current)), 900);
  };

  const insert = () => {
    if (!orderedSelection.length) return;
    onInsert(orderedSelection);
    onClose();
  };

  const onGridScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight < target.scrollHeight - 80) return;
    setVisibleLimit((limit) => Math.min(filtered.length, limit + CHUNK_SIZE));
  };

  return (
    <Modal title="GitHub Emojis" onClose={onClose}>
      <div className="insert-form">
        <label>
          <span>Search</span>
          <input value={query} placeholder="Search emojis" onChange={(event) => setQuery(event.target.value)} autoFocus />
        </label>
        <div className="emoji-grid" role="listbox" aria-label="Emoji list" onScroll={onGridScroll}>
          {loading && Array.from({ length: 12 }, (_item, index) => <span className="emoji-skeleton" key={index} />)}
          {!loading && !error && visibleEntries.map((entry) => (
            <div
              aria-selected={selected.has(entry.shortcode)}
              className={selected.has(entry.shortcode) ? "emoji-item is-selected" : "emoji-item"}
              key={entry.shortcode}
              onClick={() => toggle(entry.shortcode)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                toggle(entry.shortcode);
              }}
              role="option"
              tabIndex={0}
            >
              <span className="emoji-preview"><img alt={entry.shortcode} loading="lazy" src={entry.url} /></span>
              <span className="emoji-shortcode">
                <span>{entry.shortcode}</span>
                <button
                  aria-label={`Copy ${entry.shortcode}`}
                  className={copied === entry.shortcode ? "emoji-copy-btn is-copied" : "emoji-copy-btn"}
                  onClick={(event) => { event.stopPropagation(); void copyShortcode(entry.shortcode); }}
                  type="button"
                >
                  {copied === entry.shortcode ? <Check size={14} /> : <Clipboard size={14} />}
                </button>
              </span>
            </div>
          ))}
          {!loading && error && <p className="modal-empty">Unable to load emojis.</p>}
          {!loading && !error && filtered.length === 0 && <p className="modal-empty">No emojis found.</p>}
        </div>
        {!loading && !error && filtered.length > visibleEntries.length && <small className="form-hint">Scroll to load more emojis.</small>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!orderedSelection.length} onClick={insert}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}
