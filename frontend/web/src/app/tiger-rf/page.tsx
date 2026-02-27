"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { CHANNELS, CATEGORY_COLORS } from "@/lib/channels";
import data from "@/data/tiger-rf.json";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TOOLTIP_STYLE = {
  background: "#1a1a2e",
  border: "1px solid #444",
  borderRadius: 8,
  fontSize: 12,
  color: "#ededed",
};

const MODEL_COLORS: Record<string, string> = {
  rgb_baseline: "#868e96",
  vmif: "#4dabf7",
  vmif_plus_rgb: "#51cf66",
};

function featureColor(channel: string): string {
  if (channel === "RGB") return "#868e96";
  const meta = CHANNELS[channel];
  return meta ? CATEGORY_COLORS[meta.category] ?? "#666" : "#666";
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  sub,
  accent,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className="card text-center">
      <div
        className="text-xl font-bold"
        style={{ color: color ?? (accent ? "var(--accent)" : "var(--fg)") }}
      >
        {value}
      </div>
      <div className="text-[0.65rem] text-[var(--muted)] mt-1">{label}</div>
      {sub && (
        <div className="text-[0.6rem] text-[var(--muted)] mt-0.5 opacity-60">
          {sub}
        </div>
      )}
    </div>
  );
}

function ParamPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-2.5 py-1">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-semibold text-[var(--fg)]">{value}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Confusion-matrix heatmap (pure CSS grid)                          */
/* ------------------------------------------------------------------ */

function ConfusionMatrix() {
  const { labels, matrix } = data.confusionMatrix;
  const displayNames = data.tissueDisplayNames as Record<string, string>;
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const maxVal = Math.max(...matrix.flat());

  return (
    <div className="overflow-x-auto">
      <div
        className="inline-grid gap-[2px] text-[0.65rem]"
        style={{
          gridTemplateColumns: `120px repeat(${labels.length}, 56px)`,
        }}
      >
        {/* Header row */}
        <div />
        {labels.map((l) => (
          <div
            key={l}
            className="text-center text-[var(--muted)] font-medium px-0.5 pb-1 truncate"
            title={displayNames[l] ?? l}
          >
            {(displayNames[l] ?? l).replace(/[-_]/g, " ").slice(0, 10)}
          </div>
        ))}

        {/* Data rows */}
        {matrix.map((row, ri) => (
          <>
            <div
              key={`label-${ri}`}
              className="text-right pr-2 text-[var(--muted)] font-medium truncate leading-[56px]"
              title={displayNames[labels[ri]] ?? labels[ri]}
            >
              {displayNames[labels[ri]] ?? labels[ri]}
            </div>
            {row.map((val, ci) => {
              const isDiag = ri === ci;
              const opacity = maxVal > 0 ? 0.15 + 0.85 * (val / maxVal) : 0;
              const rowPct =
                rowTotals[ri] > 0
                  ? ((val / rowTotals[ri]) * 100).toFixed(1)
                  : "0.0";
              return (
                <div
                  key={`${ri}-${ci}`}
                  className="flex flex-col items-center justify-center rounded-md cursor-default transition-transform hover:scale-105"
                  style={{
                    width: 56,
                    height: 56,
                    background: isDiag
                      ? `rgba(77, 171, 247, ${opacity})`
                      : `rgba(255, 255, 255, ${opacity * 0.35})`,
                    border: isDiag
                      ? "1.5px solid var(--accent)"
                      : "1px solid transparent",
                  }}
                  title={`True: ${displayNames[labels[ri]]}, Pred: ${displayNames[labels[ci]]}\nCount: ${val} (${rowPct}% of row)`}
                >
                  <span className="font-bold text-[0.7rem]">{val}</span>
                  <span className="text-[0.55rem] text-[var(--muted)]">
                    {rowPct}%
                  </span>
                </div>
              );
            })}
          </>
        ))}
      </div>
      <p className="text-[0.6rem] text-[var(--muted)] mt-2">
        Rows = true label, Columns = predicted · Best model (vmIF + RGB)
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function TigerRFPage() {
  const exp = data.experiment;
  const best = data.comparison[2]; // vmif_plus_rgb
  const displayNames = data.tissueDisplayNames as Record<string, string>;

  /* ---- Comparison chart data ---- */
  const comparisonData = [
    { metric: "Accuracy", rgb_baseline: data.comparison[0].accuracy, vmif: data.comparison[1].accuracy, vmif_plus_rgb: data.comparison[2].accuracy },
    { metric: "F1 Macro", rgb_baseline: data.comparison[0].f1_macro, vmif: data.comparison[1].f1_macro, vmif_plus_rgb: data.comparison[2].f1_macro },
    { metric: "F1 Weighted", rgb_baseline: data.comparison[0].f1_weighted, vmif: data.comparison[1].f1_weighted, vmif_plus_rgb: data.comparison[2].f1_weighted },
  ];

  /* ---- Per-class table data (best model, sorted by F1) ---- */
  const perClassBest = Object.entries(
    data.perClass.vmif_plus_rgb as Record<string, { precision: number; recall: number; f1: number; support: number }>
  )
    .map(([cls, m]) => ({ cls, ...m }))
    .sort((a, b) => b.f1 - a.f1);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🌲 TIGER in a Random Forest</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Patch-level tissue classification using GigaTIME virtual mIF features
        and a Random Forest on the TIGER breast-cancer dataset.
      </p>

      {/* ============================================================ */}
      {/*  A · Experiment Overview                                      */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">Experiment Overview</h2>
        <p className="text-sm text-[var(--muted)] leading-relaxed mb-5">
          Can a simple classifier tell tissue types apart using <em>only</em> virtual
          protein statistics? If so, GigaTIME&rsquo;s predictions must encode
          biologically meaningful tumour-microenvironment information. We tile
          TIGER BCSS &amp; tissue-cells ROIs into non-overlapping patches, run
          GigaTIME inference, extract summary features, and train a Random
          Forest to classify 7 tissue types.
        </p>

        {/* Pipeline steps */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="card border-[#f472b6] border-opacity-50" style={{ borderColor: "#f472b6" }}>
            <div className="text-sm font-semibold text-[#f472b6] mb-1">1 · Tiling</div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              {exp.patchSize}×{exp.patchSize} px non-overlapping patches from TIGER
              ROIs. Patches with &gt;50% background are discarded. Each patch is
              labelled by majority vote over the tissue mask.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <ParamPill label="Patches" value={exp.totalPatches.toLocaleString()} />
              <ParamPill label="Slides" value={String(exp.nSlides)} />
            </div>
          </div>

          <div className="card" style={{ borderColor: "#a78bfa" }}>
            <div className="text-sm font-semibold text-[#a78bfa] mb-1">2 · Inference</div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              GigaTIME UNet++ predicts 23-channel probability maps. We apply sigmoid
              and extract features per patch — no full-resolution tensor materialised.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <ParamPill label="Channels" value="23" />
              <ParamPill label="Bio" value={String(exp.nBioChannels)} />
            </div>
          </div>

          <div className="card" style={{ borderColor: "#4dabf7" }}>
            <div className="text-sm font-semibold text-[#4dabf7] mb-1">3 · Features</div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              For each of 21 biological channels: <strong>mean probability</strong>,{" "}
              <strong>positive fraction</strong> (&gt;0.5), and{" "}
              <strong>spatial variance</strong> — 63 virtual mIF features. Plus 6 raw
              H&amp;E colour features (R/G/B mean &amp; variance).
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <ParamPill label="vmIF" value={`${exp.nVmifFeatures} feat`} />
              <ParamPill label="RGB" value={`${exp.nRgbFeatures} feat`} />
            </div>
          </div>

          <div className="card" style={{ borderColor: "#51cf66" }}>
            <div className="text-sm font-semibold text-[#51cf66] mb-1">4 · Random Forest</div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              A standard scikit-learn RF with balanced class weights. Train/test split
              is grouped by slide ID — no slide appears in both sets.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <ParamPill label="Trees" value={String(exp.rfEstimators)} />
              <ParamPill label="Weights" value={exp.rfClassWeight} />
            </div>
          </div>
        </div>

        {/* Hyperparameter details */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              Train / Test Split
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <ParamPill label="Method" value="GroupShuffleSplit" />
              <ParamPill label="Groups" value="slide_id" />
              <ParamPill label="Test size" value={`${exp.testSize * 100}%`} />
              <ParamPill label="Train" value={exp.nTrain.toLocaleString()} />
              <ParamPill label="Test" value={exp.nTest.toLocaleString()} />
              <ParamPill label="Seed" value={String(exp.seed)} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              Random Forest Hyperparameters
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <ParamPill label="n_estimators" value={String(exp.rfEstimators)} />
              <ParamPill label="max_depth" value="None" />
              <ParamPill label="class_weight" value={exp.rfClassWeight} />
              <ParamPill label="criterion" value={exp.rfCriterion} />
              <ParamPill label="n_jobs" value={String(exp.rfNJobs)} />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  B · Model Comparison                                         */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Model Comparison</h2>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Best Accuracy" value={pct(best.accuracy)} accent />
          <SummaryCard label="Best F1 (macro)" value={pct(best.f1_macro)} accent />
          <SummaryCard label="Best F1 (weighted)" value={pct(best.f1_weighted)} accent />
          <SummaryCard
            label="vmIF Lift over RGB"
            value={`+${((data.comparison[1].accuracy - data.comparison[0].accuracy) * 100).toFixed(1)}pp`}
            color="#4dabf7"
            sub="virtual mIF vs. baseline"
          />
        </div>

        {/* Grouped bar chart */}
        <div className="w-full" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="metric"
                tick={{ fill: "#aaa", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 0.8]}
                tick={{ fill: "#aaa", fontSize: 11 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                label={{
                  value: "Score",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#888",
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "#ededed" }}
                labelStyle={{ color: "#aaa", fontWeight: 600 }}
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
                formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#aaa" }}
              />
              <Bar dataKey="rgb_baseline" name="RGB Baseline" fill={MODEL_COLORS.rgb_baseline} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
              <Bar dataKey="vmif" name="Virtual mIF" fill={MODEL_COLORS.vmif} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
              <Bar dataKey="vmif_plus_rgb" name="vmIF + RGB" fill={MODEL_COLORS.vmif_plus_rgb} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-[var(--muted)] mt-2">
          Three feature sets compared on identical train/test split ({exp.nTrain.toLocaleString()} / {exp.nTest.toLocaleString()} patches).
          All models use the same RF configuration.
        </p>
      </section>

      {/* ============================================================ */}
      {/*  C · Per-Class Performance                                    */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Per-Class Performance</h2>
        <p className="text-xs text-[var(--muted)] mb-3">
          Best model (virtual mIF + RGB, {exp.nCombinedFeatures} features). Sorted
          by F1 score descending.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-[var(--muted)]">
                <th className="text-left py-2 pr-4 font-semibold">Tissue Class</th>
                <th className="text-right py-2 px-3 font-semibold">Precision</th>
                <th className="text-right py-2 px-3 font-semibold">Recall</th>
                <th className="text-right py-2 px-3 font-semibold">F1</th>
                <th className="text-right py-2 pl-3 font-semibold">Support</th>
              </tr>
            </thead>
            <tbody>
              {perClassBest.map((r) => (
                <tr
                  key={r.cls}
                  className="border-b border-[var(--card-border)] border-opacity-40 hover:bg-white/[0.03]"
                >
                  <td className="py-2 pr-4 font-medium text-[var(--fg)]">
                    {displayNames[r.cls] ?? r.cls}
                  </td>
                  <td className="text-right py-2 px-3">{pct(r.precision)}</td>
                  <td className="text-right py-2 px-3">{pct(r.recall)}</td>
                  <td
                    className="text-right py-2 px-3 font-semibold"
                    style={{
                      color:
                        r.f1 >= 0.6
                          ? "#51cf66"
                          : r.f1 > 0
                          ? "#fcc419"
                          : "#ff6b6b",
                    }}
                  >
                    {pct(r.f1)}
                  </td>
                  <td className="text-right py-2 pl-3 text-[var(--muted)]">
                    {r.support.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[0.6rem] text-[var(--muted)] mt-3">
          Class weight is <code className="text-[0.6rem]">&quot;balanced&quot;</code> —
          inverse-frequency weighting via sklearn. Classes with very low support
          (in-situ tumor: 117, healthy glands: 17) remain challenging despite
          reweighting.
        </p>
      </section>

      {/* ============================================================ */}
      {/*  D · Confusion Matrix                                         */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Confusion Matrix</h2>
        <ConfusionMatrix />
      </section>

      {/* ============================================================ */}
      {/*  E · Feature Importances                                      */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Feature Importances (Gini)</h2>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* vmIF-only */}
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Virtual mIF Only
              <span className="text-[var(--muted)] font-normal ml-1">(63 features)</span>
            </h3>
            <div className="w-full" style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.importances.vmif}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#aaa", fontSize: 10 }}
                    tickFormatter={(v: number) => v.toFixed(3)}
                  />
                  <YAxis
                    type="category"
                    dataKey="feature"
                    tick={{ fill: "#aaa", fontSize: 10 }}
                    width={115}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#ededed" }}
                    formatter={(v: number) => [v.toFixed(4), "Importance"]}
                    labelStyle={{ color: "#aaa", fontWeight: 600 }}
                    cursor={{ fill: "rgba(255,255,255,0.06)" }}
                  />
                  <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                    {data.importances.vmif.map((entry, i) => (
                      <Cell key={i} fill={featureColor(entry.channel)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* vmIF + RGB */}
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Virtual mIF + RGB
              <span className="text-[var(--muted)] font-normal ml-1">(69 features)</span>
            </h3>
            <div className="w-full" style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.importances.vmif_plus_rgb}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#aaa", fontSize: 10 }}
                    tickFormatter={(v: number) => v.toFixed(3)}
                  />
                  <YAxis
                    type="category"
                    dataKey="feature"
                    tick={{ fill: "#aaa", fontSize: 10 }}
                    width={115}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#ededed" }}
                    formatter={(v: number) => [v.toFixed(4), "Importance"]}
                    labelStyle={{ color: "#aaa", fontWeight: 600 }}
                    cursor={{ fill: "rgba(255,255,255,0.06)" }}
                  />
                  <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                    {data.importances.vmif_plus_rgb.map((entry, i) => (
                      <Cell key={i} fill={featureColor(entry.channel)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-xs">
          {Object.entries(CATEGORY_COLORS)
            .filter(([cat]) => cat !== "background")
            .map(([cat, color]) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: color }}
                />
                <span className="capitalize text-[var(--muted)]">{cat}</span>
              </span>
            ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#868e96" }} />
            <span className="text-[var(--muted)]">RGB</span>
          </span>
        </div>

        <p className="text-[0.6rem] text-[var(--muted)] mt-3">
          Gini importance from the 300-tree Random Forest. Left: virtual mIF
          features dominate — CD138, Transgelin, and CK lead. Right: when combined
          with RGB, raw colour stats take the top spots (R variance, R/G/B mean),
          but virtual mIF features (CK, Transgelin, CD138) remain strong — they
          contribute <em>complementary</em> information.
        </p>
      </section>

      {/* ============================================================ */}
      {/*  F · Biological Interpretation                                */}
      {/* ============================================================ */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Biological Interpretation</h2>

        <div className="space-y-5 text-sm text-[var(--muted)] leading-relaxed">
          <div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              Virtual mIF outperforms raw H&amp;E colour
            </h3>
            <p>
              The virtual mIF model achieves <strong className="text-[#4dabf7]">58.7% accuracy</strong> vs.
              the RGB baseline&rsquo;s 50.7% — an <strong>8 percentage-point lift</strong> using
              only the 63 protein-derived features. This confirms that GigaTIME&rsquo;s
              predicted channels encode tissue-type information <em>beyond</em> what
              raw stain colour provides. Combining both feature sets reaches{" "}
              <strong className="text-[#51cf66]">61.9% accuracy</strong>, showing
              the two sources are complementary, not redundant.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              Top discriminators align with known biology
            </h3>
            <p>
              The most important virtual mIF features for tissue classification are:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>
                <strong className="text-[#4dabf7]">CD138</strong> (plasma cell
                marker) — high in tumour-associated stroma where plasma-cell
                infiltration is common
              </li>
              <li>
                <strong className="text-[#fcc419]">Transgelin</strong> (smooth
                muscle/myofibroblast) — differentiates structural stroma from
                tumour epithelium
              </li>
              <li>
                <strong className="text-[#51cf66]">CK (Cytokeratin)</strong> — the
                canonical epithelial marker that directly defines the tumour
                compartment
              </li>
              <li>
                <strong className="text-[#51cf66]">Caspase3-D</strong> (apoptosis
                marker) — elevated near necrotic and tumour-adjacent regions
              </li>
              <li>
                <strong className="text-[#4dabf7]">CD20</strong> (B-cells) and{" "}
                <strong className="text-[#ff6b6b]">PD-1</strong> (exhausted T-cells) —
                immune markers that help identify inflamed stroma
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              Class-specific patterns
            </h3>
            <p>
              <strong>Invasive tumour</strong> and <strong>tumour-associated stroma</strong> are
              the best-classified types (F1 &gt; 0.62), reflecting the dominance of CK
              and stromal markers. <strong>Inflamed stroma</strong> (F1 = 0.63) benefits from
              immune-channel features like CD3/CD8. <strong>&ldquo;Rest&rdquo;</strong> tissue
              achieves surprisingly good F1 (0.72), likely because its feature
              signature is distinct from all tumour-related tissues.
            </p>
            <p className="mt-1">
              <strong>In-situ tumour</strong> and <strong>healthy glands</strong> are
              unresolvable (F1 = 0) — the former has only 117 test patches and
              morphologically overlaps with invasive tumour, while healthy glands
              has just 17 test samples. <strong>Necrosis</strong> (F1 = 0.05) is
              frequently confused with stroma, reflecting shared morphological
              features at the 256×256 patch scale.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              Deliberately minimal design
            </h3>
            <p>
              The moderate overall accuracy is <em>by design</em>. A simple Random
              Forest on 63 summary statistics is intentionally minimal — the goal is
              not state-of-the-art tissue classification, but a proof of concept
              that virtual mIF features carry real, biologically interpretable
              signal. A more complex model (e.g., spatial features, multi-scale
              context, or a neural classifier) would likely push accuracy
              substantially higher.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
