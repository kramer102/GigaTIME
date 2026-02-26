"use client";

import { useEffect, useState, useMemo } from "react";
import {
  fetchJSON,
  tileHEUrl,
  tileChannelUrl,
  type TileListResponse,
  type PredictionResponse,
} from "@/lib/api";
import {
  CHANNELS,
  CHANNEL_INDEX_BY_NAME,
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  ChannelCategory,
  ChannelName,
  groupByCategory,
} from "@/lib/channels";
import biomarkersData from "@/data/biomarkers.json";
import MultiplexViewer from "@/components/MultiplexViewer";

type ViewMode = "pred" | "gt" | "overlay" | "cam";

export default function ExplorerPage() {
  const [tiles, setTiles] = useState<string[]>([]);
  const [tile, setTile] = useState("");
  const [mode, setMode] = useState<ViewMode>("pred");
  const [stats, setStats] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchJSON<TileListResponse>("/tiles").then((d) => {
      setTiles(d.tiles);
      if (d.tiles.length) setTile(d.tiles[0]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!tile) return;
    fetchJSON<PredictionResponse>(`/tile/${tile}/prediction`).then(setStats);
  }, [tile]);

  const groups = useMemo(() => groupByCategory(), []);
  const order = CATEGORY_ORDER;

  const modeLabel = mode === "pred"
    ? "Prediction"
    : mode === "gt"
      ? "Ground Truth"
      : mode === "overlay"
        ? "Probability"
        : "Interpretability";

  const modeDescription = mode === "pred"
    ? "Thresholded model mask."
    : mode === "gt"
      ? "Measured multiplex IF channel."
      : mode === "overlay"
        ? "Continuous model confidence map."
        : "Class activation map (model attention).";

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading…</p>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Channel Explorer</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        See all 21 biomarker channels (background channels excluded) for a selected tile. Toggle between
        model prediction, ground-truth mIF, or probability heatmap.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <label className="text-xs text-[var(--muted)]">Tile:</label>
        <select
          value={tile}
          onChange={(e) => setTile(e.target.value)}
          className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-sm"
        >
          {tiles.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="flex gap-1 ml-2">
          {(["pred", "gt", "overlay", "cam"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: mode === m ? "var(--accent)" : "var(--card)",
                color: mode === m ? "#000" : "var(--muted)",
              }}
            >
              {m === "pred" ? "Prediction" : m === "gt" ? "Ground Truth" : m === "overlay" ? "Probability" : "Interpretability"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] mb-4">
        <strong>{modeLabel}:</strong> {modeDescription}
      </p>

      {/* Composite summary */}
      {stats && (
        <section className="card mt-4 mb-6">
          <h3 className="text-sm font-bold mb-3">Cell Composite Estimate</h3>
          <div className="flex gap-4 flex-wrap">
            {order.map((cat) => {
              const chNames = groups[cat] ?? [];
              const totalRatio = chNames.reduce((sum, n) => {
                const s = stats.channels.find((c) => c.name === n);
                return sum + (s?.positiveRatio ?? 0);
              }, 0);
              const color = CATEGORY_COLORS[cat as ChannelCategory];
              return (
                <div key={cat} className="text-center">
                  <div
                    className="text-2xl font-bold"
                    style={{ color }}
                  >
                    {(totalRatio * 100).toFixed(1)}%
                  </div>
                  <div className="text-[0.65rem] text-[var(--muted)] uppercase">
                    {cat}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* H&E reference */}
      <div className="card mb-6 inline-block">
        <h3 className="text-xs font-semibold text-[var(--muted)] mb-2">
          H&amp;E Input
        </h3>
        <img
          src={tileHEUrl(tile)}
          alt="H&E"
          className="w-48 h-48 object-cover rounded-lg"
        />
      </div>

      <MultiplexViewer tile={tile} />

      {/* Channel grid by category */}
      {order.map((cat) => {
        const chNames = groups[cat];
        if (!chNames?.length) return null;
        const color = CATEGORY_COLORS[cat];

        return (
          <section key={cat} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: color }}
              />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color }}>
                {cat === "immune" ? "Immune Cells" :
                 cat === "checkpoint" ? "Immune Checkpoints" :
                 cat === "tumor" ? "Tumor / Proliferation" : "Structural / Stromal"}
              </h2>
            </div>
            <div className="channel-grid">
              {chNames.map((name) => {
                const idx = CHANNEL_INDEX_BY_NAME[name as ChannelName];
                const kind = mode === "overlay" ? "prob" : mode;
                const stat = stats?.channels.find((c) => c.name === name);
                const imageKey = `${tile}:${kind}:${name}`;
                const hasImageError = imageLoadErrors[imageKey] ?? false;

                const metricValue = mode === "overlay"
                  ? stat?.meanProbability
                  : stat?.positiveRatio;
                const metricLabel = mode === "overlay" ? "mean p" : "pos";

                return (
                  <div key={name} className="card p-2">
                    <div className="relative w-full aspect-square mb-1.5 rounded-md overflow-hidden bg-black">
                      {mode === "cam" && (
                        <img
                          src={tileHEUrl(tile)}
                          alt="H&E"
                          className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale"
                          loading="lazy"
                        />
                      )}
                      {!hasImageError ? (
                        <img
                          src={tileChannelUrl(tile, idx, kind)}
                          alt={name}
                          className={`absolute inset-0 w-full h-full object-cover ${
                            mode === "cam"
                              ? "mix-blend-screen contrast-125 saturate-150"
                              : mode === "overlay"
                                ? "contrast-125 saturate-150"
                                : ""
                          }`}
                          style={{
                            imageRendering: mode === "pred" ? "pixelated" : "auto",
                          }}
                          loading="lazy"
                          onError={() => {
                            setImageLoadErrors((prev) => ({ ...prev, [imageKey]: true }));
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center text-center px-2">
                          <span className="text-[0.62rem] text-[var(--muted)]">
                            Unable to load {modeLabel.toLowerCase()} image
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color }}>
                        {name}
                      </span>
                      {mode !== "cam" && stat && metricValue !== undefined && (
                        <span className="text-[0.6rem] text-[var(--muted)]">
                          {metricLabel} {(metricValue * 100).toFixed(1)}%
                        </span>
                      )}
                      {mode === "cam" && (
                        <span className="text-[0.6rem] text-[var(--muted)]">
                          CAM view
                        </span>
                      )}
                    </div>
                    <p className="text-[0.6rem] text-[var(--muted)] leading-snug mt-0.5">
                      {CHANNELS[name]?.cellType}
                    </p>
                    {biomarkersData[name as keyof typeof biomarkersData] && (
                      <div className="mt-2 pt-2 border-t border-[var(--card-border)]">
                        <p className="text-[0.65rem] text-[var(--foreground)] mb-1">
                          <strong>Bio:</strong> {biomarkersData[name as keyof typeof biomarkersData].biologicalRelevance}
                        </p>
                        <p className="text-[0.65rem] text-[var(--muted)] italic">
                          <strong>Model:</strong> {biomarkersData[name as keyof typeof biomarkersData].conjecture}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
