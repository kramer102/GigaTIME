"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fetchJSON, type MetricsResponse, type PerChannelMetric } from "@/lib/api";
import {
  CHANNELS,
  ACTIVE_CHANNELS,
  CATEGORY_COLORS,
  groupByCategory,
} from "@/lib/channels";

/* Flattened row for charts/tables */
interface ChannelRow {
  name: string;
  pearson: number;
  std: number;
  n: number;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [sortBy, setSortBy] = useState<"pearson" | "name" | "category">("pearson");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJSON<MetricsResponse>("/metrics")
      .then((d) => {
        setMetrics(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /* Flatten perChannel map into sortable array */
  const rows = useMemo<ChannelRow[]>(() => {
    if (!metrics) return [];
    return ACTIVE_CHANNELS
      .filter((n) => metrics.perChannel[n]?.mean != null)
      .map((name) => {
        const m = metrics.perChannel[name] as PerChannelMetric;
        return { name, pearson: m.mean!, std: m.std ?? 0, n: m.n };
      });
  }, [metrics]);

  const sorted = useMemo(() => {
    if (!rows.length) return [];
    if (sortBy === "pearson") return [...rows].sort((a, b) => b.pearson - a.pearson);
    if (sortBy === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    const groups = groupByCategory();
    const order = ["immune", "checkpoint", "tumor", "structural"];
    return [...rows].sort((a, b) => {
      const cA = Object.entries(groups).find(([, ns]) => ns.includes(a.name))?.[0] ?? "";
      const cB = Object.entries(groups).find(([, ns]) => ns.includes(b.name))?.[0] ?? "";
      const diff = order.indexOf(cA) - order.indexOf(cB);
      return diff !== 0 ? diff : b.pearson - a.pearson;
    });
  }, [rows, sortBy]);

  const barColor = (name: string) => {
    const ch = CHANNELS[name];
    if (!ch) return "#666";
    return CATEGORY_COLORS[ch.category] ?? "#666";
  };

  /* Summary stats */
  const summary = useMemo(() => {
    if (!sorted.length) return null;
    const pearsons = sorted.map((c) => c.pearson);
    const avg = pearsons.reduce((s, v) => s + v, 0) / pearsons.length;
    const best = sorted.reduce((a, b) => (a.pearson > b.pearson ? a : b));
    const worst = sorted.reduce((a, b) => (a.pearson < b.pearson ? a : b));
    return { avg, best, worst, count: sorted.length };
  }, [sorted]);

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading metrics…</p>;
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted)]">
          No metrics available. Run the pre-computation script first:
        </p>
        <code className="text-xs bg-[var(--card)] p-2 rounded-lg mt-2 inline-block">
          python frontend/precompute.py
        </code>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Metrics Dashboard</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Quantitative evaluation of GigaTIME predictions against COMET ground truth
        across the sample dataset.
      </p>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <SummaryCard label="Channels" value={String(summary.count)} />
          <SummaryCard
            label="Mean Pearson r"
            value={summary.avg.toFixed(3)}
            accent
          />
          <SummaryCard
            label="Best Channel"
            value={`${summary.best.name} (${summary.best.pearson.toFixed(3)})`}
            color={barColor(summary.best.name)}
          />
          <SummaryCard
            label="Weakest Channel"
            value={`${summary.worst.name} (${summary.worst.pearson.toFixed(3)})`}
            color={barColor(summary.worst.name)}
          />
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-[var(--muted)]">Sort by:</span>
        {(["pearson", "category", "name"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: sortBy === s ? "var(--accent)" : "var(--card)",
              color: sortBy === s ? "#000" : "var(--muted)",
            }}
          >
            {s === "pearson" ? "Pearson ↓" : s === "category" ? "Category" : "A–Z"}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="card mb-8">
        <h2 className="text-sm font-bold mb-4">Per-Channel Mean Pearson Correlation</h2>
        <div className="w-full" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} margin={{ top: 5, right: 20, bottom: 60, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#aaa", fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fill: "#aaa", fontSize: 11 }}
                label={{
                  value: "Pearson r",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#888",
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid #444",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#ededed",
                }}
                itemStyle={{ color: "#ededed" }}
                labelStyle={{ color: "#aaa", fontWeight: 600 }}
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
                formatter={(v: number) => [v.toFixed(4), "Pearson r"]}
              />
              <Bar dataKey="pearson" radius={[4, 4, 0, 0]}>
                {sorted.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.name)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-tile heatmap (if available) */}
      {metrics && metrics.perTile.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-sm font-bold mb-2">Per-Tile Pearson (Heatmap)</h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Each cell shows the Pearson correlation for one tile × channel combination.
            Darker = lower, brighter = higher.
          </p>
          <div className="overflow-x-auto">
            <table className="text-[0.55rem]">
              <thead>
                <tr>
                  <th className="px-1 py-0.5 text-left text-[var(--muted)]">Tile</th>
                  {ACTIVE_CHANNELS.map((n) => (
                    <th
                      key={n}
                      className="px-1 py-0.5 font-bold"
                      style={{ color: barColor(n) }}
                    >
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.perTile.slice(0, 30).map((row) => (
                  <tr key={row.tile}>
                    <td className="px-1 py-0.5 text-[var(--muted)] font-mono whitespace-nowrap">
                      {String(row.tile).slice(0, 16)}
                    </td>
                    {ACTIVE_CHANNELS.map((n) => {
                      const val = typeof row[n] === "number" ? (row[n] as number) : NaN;
                      const bg = isNaN(val)
                        ? "transparent"
                        : `rgba(74, 222, 128, ${Math.max(val, 0)})`;
                      return (
                        <td
                          key={n}
                          className="px-1 py-0.5 text-center font-mono"
                          style={{
                            background: bg,
                            color: isNaN(val)
                              ? "var(--muted)"
                              : val > 0.5
                                ? "#000"
                                : "#ededed",
                          }}
                          title={`${n}: ${isNaN(val) ? "N/A" : val.toFixed(3)}`}
                        >
                          {isNaN(val) ? "–" : val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {metrics.perTile.length > 30 && (
            <p className="text-xs text-[var(--muted)] mt-2">
              Showing 30 of {metrics.perTile.length} tiles.
            </p>
          )}
        </div>
      )}

      {/* Category breakdown */}
      <div className="card mb-8">
        <h2 className="text-sm font-bold mb-4">Category Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["immune", "checkpoint", "tumor", "structural"] as const).map((cat) => {
            const groups = groupByCategory();
            const names = groups[cat] ?? [];
            const chRows = sorted.filter((c) => names.includes(c.name));
            const avg =
              chRows.length > 0
                ? chRows.reduce((s, c) => s + c.pearson, 0) / chRows.length
                : 0;
            const color = CATEGORY_COLORS[cat];
            return (
              <div key={cat} className="p-3 rounded-lg bg-[var(--background)]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-bold uppercase" style={{ color }}>
                    {cat}
                  </span>
                </div>
                <div className="text-xl font-bold" style={{ color }}>
                  {avg.toFixed(3)}
                </div>
                <div className="text-[0.6rem] text-[var(--muted)]">
                  mean Pearson r ({chRows.length} ch)
                </div>
                <div className="mt-2 space-y-1">
                  {chRows.map((c) => (
                    <div key={c.name} className="flex justify-between text-xs">
                      <span className="text-[var(--fg)]" style={{ opacity: 0.7 }}>{c.name}</span>
                      <span className="font-mono text-[var(--fg)]">{c.pearson.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full table */}
      <div className="card">
        <h2 className="text-sm font-bold mb-3">Full Channel Table</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left py-2 px-2">Channel</th>
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-right py-2 px-2">Mean Pearson r</th>
                <th className="text-right py-2 px-2">Std</th>
                <th className="text-right py-2 px-2">N tiles</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const ch = CHANNELS[c.name];
                const color = ch ? CATEGORY_COLORS[ch.category] : "#888";
                return (
                  <tr
                    key={c.name}
                    className="border-b border-[var(--card-border)]/30 hover:bg-[var(--background)]"
                  >
                    <td className="py-1.5 px-2 font-bold" style={{ color }}>
                      {c.name}
                    </td>
                    <td className="py-1.5 px-2 text-[var(--muted)]">
                      {ch?.category ?? "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {c.pearson.toFixed(4)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {c.std.toFixed(4)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {c.n}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  color,
}: {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className="card text-center">
      <div
        className="text-xl font-bold"
        style={{ color: color ?? (accent ? "var(--accent)" : "var(--foreground)") }}
      >
        {value}
      </div>
      <div className="text-[0.65rem] text-[var(--muted)] mt-1">{label}</div>
    </div>
  );
}
