"use client";

import { useState } from "react";

type FurnitureSize = {
  label: string;
  widthIn: number | null;
  depthIn: number | null;
  heightIn: number | null;
};

type ParsedFurniture = {
  name: string;
  category: string;
  sizes: FurnitureSize[];
  defaultSizeIndex: number;
  colorOrFinish?: string;
  material?: string;
  sourceUrl: string;
  warnings: string[];
};

type FurnitureItem = {
  id: string;
  data: ParsedFurniture;
  selectedSizeIndex: number;
};

function formatDimensions(size: FurnitureSize): string {
  const { widthIn, depthIn, heightIn } = size;
  if (widthIn == null && depthIn == null && heightIn == null) {
    return "dimensions unknown";
  }
  const fmt = (n: number | null) => (n != null ? String(n) : "?");
  return `${fmt(widthIn)} × ${fmt(depthIn)} × ${fmt(heightIn)} in`;
}

export default function FurnitureUrlInput() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FurnitureItem[]>([]);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parse-furniture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "An unexpected error occurred.");
      } else {
        const data = json as ParsedFurniture;
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            data,
            selectedSizeIndex: Math.max(
              0,
              Math.min(data.defaultSizeIndex ?? 0, data.sizes.length - 1)
            ),
          },
        ]);
        setUrl("");
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateSizeIndex = (id: string, index: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selectedSizeIndex: index } : item
      )
    );
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Paste a furniture product URL — IKEA, Wayfair, Amazon, etc."
          disabled={loading}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !url.trim()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 shrink-0 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Adding…
            </>
          ) : (
            "Add"
          )}
        </button>
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        Works best with IKEA, Article, CB2. Sites that load product data with JavaScript (West Elm, Pottery Barn, Wayfair, Amazon) may not parse — manual entry coming in a later update.
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const size =
              item.data.sizes[item.selectedSizeIndex] ?? item.data.sizes[0];
            const meta = [item.data.colorOrFinish, item.data.material]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-800">
                      {item.data.name}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-zinc-500">
                      {item.data.category}
                      {meta ? ` · ${meta}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove item"
                    className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3">
                  {item.data.sizes.length > 1 ? (
                    <div className="flex items-center gap-3">
                      <label className="shrink-0 text-xs font-medium text-zinc-500">
                        Size
                      </label>
                      <select
                        value={item.selectedSizeIndex}
                        onChange={(e) =>
                          updateSizeIndex(item.id, Number(e.target.value))
                        }
                        className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
                      >
                        {item.data.sizes.map((s, i) => (
                          <option key={i} value={i}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">{size.label}</p>
                  )}
                  <p className="mt-1.5 font-mono text-sm text-zinc-700">
                    {formatDimensions(size)}
                  </p>
                </div>

                {item.data.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    {item.data.warnings.join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
