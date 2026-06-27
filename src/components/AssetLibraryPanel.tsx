import { Copy, ImagePlus, Link2, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatAssetSize } from "../lib/assets";
import type { MarkdownAsset } from "../types";

interface AssetLibraryPanelProps {
  assets: MarkdownAsset[];
  opened: boolean;
  onAddFiles: (files: FileList | File[]) => void;
  onAddRemote: (name: string, source: string) => void;
  onClose: () => void;
  onCopySource: (asset: MarkdownAsset) => void;
  onInsert: (asset: MarkdownAsset) => void;
  onRemove: (id: string) => void;
}

export function AssetLibraryPanel({ assets, opened, onAddFiles, onAddRemote, onClose, onCopySource, onInsert, onRemove }: AssetLibraryPanelProps) {
  const [query, setQuery] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [remoteSource, setRemoteSource] = useState("");
  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) => `${asset.name}\n${asset.source}\n${asset.provider}`.toLowerCase().includes(needle));
  }, [assets, query]);

  if (!opened) return null;

  const addRemote = () => {
    onAddRemote(remoteName, remoteSource);
    setRemoteName("");
    setRemoteSource("");
  };

  return (
    <div className="asset-library-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="asset-library" role="dialog" aria-modal="true" aria-label="Asset library">
        <div className="asset-library-head">
          <div>
            <span>Assets</span>
            <strong>{assets.length} images</strong>
          </div>
          <button type="button" aria-label="Close asset library" onClick={onClose}><X size={17} /></button>
        </div>

        <label className="asset-search">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Search assets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="asset-actions">
          <label className="asset-file-button">
            <ImagePlus size={16} />
            Add images
            <input type="file" accept="image/*" multiple onChange={(event) => event.target.files && onAddFiles(event.target.files)} />
          </label>
        </div>

        <div className="asset-remote-form">
          <label>
            <span>Remote image URL</span>
            <input value={remoteSource} placeholder="https://example.com/image.png" onChange={(event) => setRemoteSource(event.target.value)} />
          </label>
          <label>
            <span>Name</span>
            <input value={remoteName} placeholder="Optional name" onChange={(event) => setRemoteName(event.target.value)} />
          </label>
          <button type="button" onClick={addRemote} disabled={!remoteSource.trim()}><Plus size={16} />Register</button>
        </div>

        <div className="asset-grid">
          {filteredAssets.length ? filteredAssets.map((asset) => (
            <article key={asset.id} className="asset-card">
              <button type="button" className="asset-preview" onClick={() => onInsert(asset)}>
                <img src={asset.source} alt={asset.name} loading="lazy" />
              </button>
              <div className="asset-meta">
                <strong>{asset.name}</strong>
                <span>{asset.provider} | {formatAssetSize(asset)}</span>
              </div>
              <div className="asset-card-actions">
                <button type="button" onClick={() => onInsert(asset)}><ImagePlus size={14} />Insert</button>
                <button type="button" aria-label={`Copy ${asset.name} URL`} onClick={() => onCopySource(asset)}><Copy size={14} /></button>
                <button type="button" aria-label={`Open ${asset.name}`} onClick={() => window.open(asset.source, "_blank", "noopener,noreferrer")}><Link2 size={14} /></button>
                <button type="button" aria-label={`Remove ${asset.name}`} onClick={() => onRemove(asset.id)}><Trash2 size={14} /></button>
              </div>
            </article>
          )) : (
            <div className="asset-empty">
              <strong>No assets yet</strong>
              <span>Paste an image into the editor, add files here, or register a remote image URL.</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
