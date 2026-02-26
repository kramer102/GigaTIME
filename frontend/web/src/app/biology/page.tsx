"use client";

import { useState, useMemo } from "react";
import {
  CHANNELS,
  ACTIVE_CHANNELS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/channels";
import biomarkers from "@/data/biomarkers.json";
import {
  Search,
  ChevronDown,
  ChevronUp,
  Brain,
  Microscope,
  FlaskConical,
  Dna,
} from "lucide-react";

/* ── Types ── */
type BiomarkerEntry = {
  description: string;
  biologicalRelevance: string;
  conjecture: string;
};
const biomarkerData = biomarkers as Record<string, BiomarkerEntry>;

/* ── TME educational content ── */
const TME_INTRO = {
  title: "What is the Tumor Microenvironment?",
  body: `The tumor microenvironment (TME) is the complex ecosystem that surrounds a tumor. It includes immune cells, blood vessels, stromal (structural) cells, signaling molecules, and the extracellular matrix. Understanding the TME is critical because it influences how tumors grow, evade the immune system, and respond to therapy.

Traditional analysis requires multiplex immunofluorescence (mIF) staining — an expensive, tissue-destructive process that uses fluorescent antibodies to tag specific proteins in tissue sections. GigaTIME uses deep learning to **predict** these protein maps from a single, inexpensive H&E stain.`,
};

interface CategoryGuide {
  category: string;
  title: string;
  description: string;
  clinical: string;
}

const GUIDES: CategoryGuide[] = [
  {
    category: "immune",
    title: "Immune Cells",
    description:
      "Immune cells infiltrate the tumor and can either attack or inadvertently protect cancer cells. Their density and spatial distribution are among the strongest predictors of patient outcome.",
    clinical:
      "High immune cell infiltration (especially CD8+ cytotoxic T cells) is generally associated with better prognosis and response to immunotherapy.",
  },
  {
    category: "checkpoint",
    title: "Immune Checkpoints",
    description:
      "Immune checkpoint molecules act as 'brakes' on the immune system. Tumors can hijack these pathways to evade immune attack. Checkpoint inhibitor drugs (like pembrolizumab and nivolumab) block these brakes to re-activate anti-tumor immunity.",
    clinical:
      "PD-L1 expression on tumor cells is used clinically to predict response to PD-1/PD-L1 inhibitors. Co-localization of PD-1 (on T cells) with PD-L1 (on tumor cells) suggests active immune suppression.",
  },
  {
    category: "tumor",
    title: "Tumor & Proliferation Markers",
    description:
      "These markers identify cancer cells themselves and measure how actively they are dividing or dying. The balance between proliferation and cell death shapes tumor growth rate.",
    clinical:
      "High Ki67 indicates rapidly dividing tumor (aggressive); high Caspase-3 / PHH3 may indicate response to chemotherapy. CK (cytokeratin) delineates epithelial tumor boundaries.",
  },
  {
    category: "structural",
    title: "Structural & Stromal Markers",
    description:
      "Structural markers reveal the tissue architecture: blood vessels, muscle, and nuclear organization. The stroma provides physical scaffolding and can facilitate or hinder immune cell access to tumor nests.",
    clinical:
      "CD34+ vessel density indicates angiogenesis; high Transgelin/α-SMA marks cancer-associated fibroblasts (CAFs) which are linked to poor prognosis. DAPI stains all nuclei, giving overall tissue cellularity.",
  },
];

const SPATIAL_PATTERNS = [
  {
    title: "Immune Hot vs. Cold Tumors",
    description:
      "\"Hot\" tumors have dense immune infiltration throughout (high CD3, CD8, CD20 within tumor nests). \"Cold\" tumors exclude immune cells — they crowd the tumor border but cannot penetrate. GigaTIME lets you visualize this spatial distinction without mIF.",
  },
  {
    title: "Tertiary Lymphoid Structures (TLS)",
    description:
      "When CD20+ B cells cluster near CD3+ T cells and CD11c+ dendritic cells away from the tumor core, this suggests formation of TLS — ectopic lymph node-like structures associated with improved immunotherapy response.",
  },
  {
    title: "Immune Evasion Niches",
    description:
      "Regions where PD-L1+ cells neighbor PD-1+ T cells indicate active immune suppression. If CD8+ cells are present but co-localize with PD-1, the cytotoxic T cells may be 'exhausted' and unable to kill tumor cells.",
  },
  {
    title: "Tumor–Stroma Interface",
    description:
      "The boundary between CK+ tumor nests and Transgelin+/Actin+ stromal regions is critical. Dense fibrotic stroma (high Transgelin) can physically block immune cell access, contributing to treatment resistance.",
  },
];

/* ── Helpers ── */
const ALL_CATEGORIES = ["immune", "checkpoint", "tumor", "structural"] as const;

function channelsForCategory(cat: string): string[] {
  return ACTIVE_CHANNELS.filter((ch) => CHANNELS[ch]?.category === cat);
}

/* ================================================================== */

export default function BiologyPage() {
  const [expanded, setExpanded] = useState<string | null>("immune");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  /* ── search + category filter ── */
  const filteredChannels = useMemo(() => {
    const term = search.toLowerCase();
    return ACTIVE_CHANNELS.filter((ch) => {
      const meta = CHANNELS[ch];
      const bio = biomarkerData[ch];
      // category filter
      if (activeCategory && meta?.category !== activeCategory) return false;
      // text search
      if (!term) return true;
      return (
        ch.toLowerCase().includes(term) ||
        meta?.cellType?.toLowerCase().includes(term) ||
        meta?.desc?.toLowerCase().includes(term) ||
        bio?.description?.toLowerCase().includes(term) ||
        bio?.biologicalRelevance?.toLowerCase().includes(term) ||
        bio?.conjecture?.toLowerCase().includes(term)
      );
    });
  }, [search, activeCategory]);

  /* group filtered channels by category */
  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const ch of filteredChannels) {
      const cat = CHANNELS[ch]?.category ?? "other";
      if (!g[cat]) g[cat] = [];
      g[cat].push(ch);
    }
    return g;
  }, [filteredChannels]);

  const toggleCard = (ch: string) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Biology Guide</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        An interactive primer on the biology behind GigaTIME&apos;s 23 protein channels
        and the tumor microenvironment.
      </p>

      {/* ── TME overview ── */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">{TME_INTRO.title}</h2>
        <p className="text-sm leading-relaxed text-[var(--foreground)]/80 whitespace-pre-line">
          {TME_INTRO.body}
        </p>
      </section>

      {/* ── H&E vs mIF ── */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">H&amp;E vs. Multiplex IF</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <h3 className="font-bold text-pink-400 mb-1">H&amp;E Stain</h3>
            <ul className="list-disc list-inside text-[var(--foreground)]/70 space-y-1">
              <li>Hematoxylin stains nuclei purple</li>
              <li>Eosin stains cytoplasm / ECM pink</li>
              <li>Shows tissue architecture, cell shapes</li>
              <li>Can identify morphologically distinct cell types (lymphocytes, epithelial/tumor cells, plasma cells, fibroblasts) — but only by the trained eye of a pathologist</li>
              <li>Cannot identify specific protein expression</li>
              <li>Cheap, fast, non-destructive</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <h3 className="font-bold text-cyan-400 mb-1">Multiplex IF (COMET)</h3>
            <ul className="list-disc list-inside text-[var(--foreground)]/70 space-y-1">
              <li>Fluorescent antibodies bind specific proteins</li>
              <li>Each protein gets a unique fluorescence channel</li>
              <li>Can visualize 20+ proteins simultaneously</li>
              <li>Expensive ($100s / slide), tissue-destructive</li>
              <li>Requires serial sectioning and careful alignment</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Category overview accordion ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-4">Category Overview</h2>
        <div className="space-y-2">
          {GUIDES.map((g) => {
            const isOpen = expanded === g.category;
            const color = CATEGORY_COLORS[g.category] ?? "#888";
            const chCount = channelsForCategory(g.category).length;
            return (
              <div key={g.category} className="card">
                <button
                  onClick={() => setExpanded(isOpen ? null : g.category)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="font-bold" style={{ color }}>
                      {g.title}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      ({chCount} markers)
                    </span>
                  </div>
                  <span className="text-[var(--muted)] text-lg">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-[var(--foreground)]/80">
                      {g.description}
                    </p>
                    <div className="p-3 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                      <p className="text-xs font-semibold text-[var(--accent)] mb-1">
                        Clinical Relevance
                      </p>
                      <p className="text-xs text-[var(--foreground)]/70">
                        {g.clinical}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Biomarker Deep-Dive ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Microscope className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-lg font-bold">Biomarker Deep-Dive</h2>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">
          Explore each protein marker — its biology and what the AI model may be
          learning from H&amp;E morphology.
        </p>

        {/* search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markers, cell types, biology…"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--background)] border border-[var(--muted)]/30 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        {/* category filter pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === null
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            All ({ACTIVE_CHANNELS.length})
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const color = CATEGORY_COLORS[cat];
            const count = channelsForCategory(cat).length;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  isActive
                    ? "text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                style={
                  isActive
                    ? { background: color, borderColor: color }
                    : { borderColor: `${color}44` }
                }
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* results count */}
        {(search || activeCategory) && (
          <p className="text-xs text-[var(--muted)] mb-3">
            Showing {filteredChannels.length} of {ACTIVE_CHANNELS.length} markers
          </p>
        )}

        {/* biomarker cards grouped by category */}
        {filteredChannels.length === 0 ? (
          <div className="card text-center py-8 text-[var(--muted)] text-sm">
            No markers match your search.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, channels]) => {
              const color = CATEGORY_COLORS[cat] ?? "#888";
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: color }}
                    />
                    <h3 className="text-sm font-bold" style={{ color }}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const meta = CHANNELS[ch];
                      const bio = biomarkerData[ch];
                      const isOpen = expandedCards.has(ch);
                      const chColor = meta?.color ?? color;

                      return (
                        <div
                          key={ch}
                          className="card transition-all"
                          style={{
                            borderLeft: `3px solid ${chColor}`,
                          }}
                        >
                          {/* card header — always visible */}
                          <button
                            onClick={() => toggleCard(ch)}
                            className="w-full flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: chColor }}
                              />
                              <div>
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: chColor }}
                                >
                                  {ch}
                                </span>
                                {meta?.cellType && (
                                  <span className="text-xs text-[var(--muted)] ml-2">
                                    {meta.cellType}
                                  </span>
                                )}
                                <p className="text-xs text-[var(--foreground)]/60 mt-0.5">
                                  {bio?.description ?? meta?.desc}
                                </p>
                              </div>
                            </div>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 text-[var(--muted)] shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--muted)] shrink-0" />
                            )}
                          </button>

                          {/* expanded content */}
                          {isOpen && bio && (
                            <div className="mt-4 space-y-3 pl-8">
                              {/* Biological Relevance */}
                              <div className="flex items-start gap-2">
                                <Dna className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                                <div>
                                  <p className="text-xs font-semibold text-emerald-400 mb-0.5">
                                    Biological Relevance
                                  </p>
                                  <p className="text-xs text-[var(--foreground)]/70 leading-relaxed">
                                    {bio.biologicalRelevance}
                                  </p>
                                </div>
                              </div>

                              {/* Channel description from channels.ts */}
                              {meta?.desc && (
                                <div className="flex items-start gap-2">
                                  <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" />
                                  <div>
                                    <p className="text-xs font-semibold text-sky-400 mb-0.5">
                                      Marker Role
                                    </p>
                                    <p className="text-xs text-[var(--foreground)]/70 leading-relaxed">
                                      {meta.desc}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* AI's View — distinct styling */}
                              <div className="rounded-lg bg-purple-500/10 border border-purple-500/25 p-3">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Brain className="w-4 h-4 text-purple-400" />
                                  <p className="text-xs font-semibold text-purple-400">
                                    AI&apos;s View
                                  </p>
                                </div>
                                <p className="text-xs text-purple-300/80 leading-relaxed italic">
                                  {bio.conjecture}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Spatial patterns ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-4">Key Spatial Patterns to Look For</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SPATIAL_PATTERNS.map((sp) => (
            <div key={sp.title} className="card">
              <h3 className="text-sm font-bold text-[var(--accent)] mb-2">
                {sp.title}
              </h3>
              <p className="text-xs text-[var(--foreground)]/70 leading-relaxed">
                {sp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How GigaTIME Works ── */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">How GigaTIME Works</h2>
        <div className="space-y-3 text-sm text-[var(--foreground)]/80">
          <p>
            <span className="font-bold text-[var(--accent)]">Architecture:</span>{" "}
            GigaTIME uses a UNet++ (Nested U-Net) with VGG-style encoder blocks. The
            encoder has five levels with filter sizes [32, 64, 128, 256, 512], and
            dense skip connections between encoder and decoder allow the network to
            learn both fine-grained and high-level tissue features.
          </p>
          <p>
            <span className="font-bold text-[var(--accent)]">Input:</span>{" "}
            A single 512×512 pixel H&amp;E tile, normalized with ImageNet statistics.
            For tiles larger than 256×256, a sliding window approach is used.
          </p>
          <p>
            <span className="font-bold text-[var(--accent)]">Output:</span>{" "}
            23 binary protein maps (one per channel). Raw sigmoid probabilities are
            thresholded at 0.5 to produce binary predictions. This captures which
            pixels express each protein marker.
          </p>
          <p>
            <span className="font-bold text-[var(--accent)]">Training Data:</span>{" "}
            The only truly paired mIF/H&amp;E images were an initial set of{" "}
            <strong>21 slides from a lung adenocarcinoma (LUAD) cohort</strong>{" "}
            — 12 for training, 4 as the development set, and 5 held out for testing.
            Though the number of slides is small, each whole-slide image yields
            thousands of 256×256 patches, providing substantial training data.
            All other images in the pipeline are H&amp;E-only slides whose channels
            are &ldquo;virtual stains&rdquo; inferred by the model.
          </p>
          <p>
            <span className="font-bold text-[var(--accent)]">Loss:</span>{" "}
            Trained using Dice loss + L1 loss + Pearson correlation loss to
            learn both spatial accuracy and statistical consistency. The ground-truth
            mIF channels were Otsu-thresholded before training.
          </p>
          <p>
            <span className="font-bold text-[var(--accent)]">Scale:</span>{" "}
            The &quot;Giga&quot; in GigaTIME refers to the massive scale — the model processes
            gigapixel whole-slide images by tiling them into overlapping patches,
            processing each, and stitching the results into a complete virtual mIF
            whole-slide.
          </p>
        </div>
      </section>

      {/* ── Glossary ── */}
      <section className="card">
        <h2 className="text-lg font-bold mb-3">Glossary</h2>
        <dl className="space-y-2 text-sm">
          {[
            ["TME", "Tumor microenvironment — the cells and structures surrounding a tumor"],
            ["mIF", "Multiplex immunofluorescence — technique to visualize multiple proteins simultaneously"],
            ["COMET", "CO-detection by indexing — commercial mIF platform used to generate GigaTIME training data"],
            ["H&E", "Hematoxylin and eosin — standard histology stain showing tissue morphology"],
            ["UNet++", "Nested U-Net — encoder-decoder architecture with dense skip connections"],
            ["Dice Loss", "Overlap-based loss measuring segmentation accuracy (2×TP / (2×TP + FP + FN))"],
            ["Pearson r", "Correlation metric measuring agreement between predicted and ground-truth spatial patterns"],
            ["TLS", "Tertiary lymphoid structures — immune cell aggregates associated with good immunotherapy response"],
            ["CAF", "Cancer-associated fibroblast — stromal cell type linked to tumor progression"],
            ["Angiogenesis", "Formation of new blood vessels — tumors promote this for nutrient supply"],
          ].map(([term, def]) => (
            <div key={term} className="flex gap-2">
              <dt className="font-bold text-[var(--accent)] shrink-0 w-20">{term}</dt>
              <dd className="text-[var(--foreground)]/70">{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
