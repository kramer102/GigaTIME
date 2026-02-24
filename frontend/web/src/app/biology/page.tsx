"use client";

import { useState } from "react";
import {
  CHANNELS,
  ACTIVE_CHANNELS,
  CATEGORY_COLORS,
  groupByCategory,
} from "@/lib/channels";

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
  channels: { name: string; role: string }[];
}

const GUIDES: CategoryGuide[] = [
  {
    category: "immune",
    title: "Immune Cells",
    description:
      "Immune cells infiltrate the tumor and can either attack or inadvertently protect cancer cells. Their density and spatial distribution are among the strongest predictors of patient outcome.",
    clinical:
      "High immune cell infiltration (especially CD8+ cytotoxic T cells) is generally associated with better prognosis and response to immunotherapy.",
    channels: [
      { name: "CD3", role: "Pan T-cell marker — marks all T lymphocytes" },
      { name: "CD4", role: "Helper T cells — coordinate immune responses" },
      { name: "CD8", role: "Cytotoxic T cells — directly kill tumor cells" },
      { name: "CD20", role: "B lymphocytes — antibody production and antigen presentation" },
      { name: "CD68", role: "Macrophages — phagocytosis and inflammation (can be pro- or anti-tumor)" },
      { name: "CD14", role: "Monocytes — precursors to macrophages and dendritic cells" },
      { name: "CD16", role: "Natural killer cells / monocytes — innate immune surveillance" },
      { name: "CD11c", role: "Dendritic cells — present antigens to T cells to initiate adaptive immunity" },
      { name: "CD138", role: "Plasma cells — terminally differentiated B cells producing antibodies" },
      { name: "T-bet", role: "Transcription factor indicating Th1-polarized (anti-tumor) immune response" },
      { name: "Tryptase", role: "Mast cells — involved in allergy, inflammation, and tumor angiogenesis" },
    ],
  },
  {
    category: "checkpoint",
    title: "Immune Checkpoints",
    description:
      "Immune checkpoint molecules act as 'brakes' on the immune system. Tumors can hijack these pathways to evade immune attack. Checkpoint inhibitor drugs (like pembrolizumab and nivolumab) block these brakes to re-activate anti-tumor immunity.",
    clinical:
      "PD-L1 expression on tumor cells is used clinically to predict response to PD-1/PD-L1 inhibitors. Co-localization of PD-1 (on T cells) with PD-L1 (on tumor cells) suggests active immune suppression.",
    channels: [
      { name: "PD-1", role: "Expressed on exhausted T cells — a marker of chronic antigen stimulation" },
      { name: "PD-L1", role: "Expressed on tumor/immune cells — binds PD-1 to suppress T cell activity" },
    ],
  },
  {
    category: "tumor",
    title: "Tumor & Proliferation Markers",
    description:
      "These markers identify cancer cells themselves and measure how actively they are dividing or dying. The balance between proliferation and cell death shapes tumor growth rate.",
    clinical:
      "High Ki67 indicates rapidly dividing tumor (aggressive); high Caspase-3 / PHH3 may indicate response to chemotherapy. CK (cytokeratin) delineates epithelial tumor boundaries.",
    channels: [
      { name: "CK", role: "Cytokeratin — epithelial cell marker that outlines tumor cell nests" },
      { name: "Ki67", role: "Proliferation marker — fraction of actively dividing cells" },
      { name: "PHH3-B", role: "Phospho-histone H3 — marks cells in mitosis (M phase)" },
      { name: "Caspase3-D", role: "Cleaved Caspase-3 — marker of apoptosis (programmed cell death)" },
    ],
  },
  {
    category: "structural",
    title: "Structural & Stromal Markers",
    description:
      "Structural markers reveal the tissue architecture: blood vessels, muscle, and nuclear organization. The stroma provides physical scaffolding and can facilitate or hinder immune cell access to tumor nests.",
    clinical:
      "CD34+ vessel density indicates angiogenesis; high Transgelin/α-SMA marks cancer-associated fibroblasts (CAFs) which are linked to poor prognosis. DAPI stains all nuclei, giving overall tissue cellularity.",
    channels: [
      { name: "DAPI", role: "Nuclei stain — shows all cell nuclei regardless of cell type" },
      { name: "CD34", role: "Endothelial marker — highlights blood vessel networks" },
      { name: "Actin-D", role: "Smooth muscle actin — marks myofibroblasts and vessel walls" },
      { name: "Transgelin", role: "SM22α — stromal/fibroblast marker associated with ECM remodeling" },
    ],
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

export default function BiologyPage() {
  const [expanded, setExpanded] = useState<string | null>("immune");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Biology Guide</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        An interactive primer on the biology behind GigaTIME&apos;s 23 protein channels
        and the tumor microenvironment.
      </p>

      {/* TME overview */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">{TME_INTRO.title}</h2>
        <p className="text-sm leading-relaxed text-[var(--foreground)]/80 whitespace-pre-line">
          {TME_INTRO.body}
        </p>
      </section>

      {/* How mIF works */}
      <section className="card mb-8">
        <h2 className="text-lg font-bold mb-3">H&amp;E vs. Multiplex IF</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <h3 className="font-bold text-pink-400 mb-1">H&amp;E Stain</h3>
            <ul className="list-disc list-inside text-[var(--foreground)]/70 space-y-1">
              <li>Hematoxylin stains nuclei purple</li>
              <li>Eosin stains cytoplasm / ECM pink</li>
              <li>Shows tissue architecture, cell shapes</li>
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

      {/* Category guides — accordion */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-4">Channel-by-Channel Guide</h2>
        <div className="space-y-2">
          {GUIDES.map((g) => {
            const isOpen = expanded === g.category;
            const color = CATEGORY_COLORS[g.category] ?? "#888";
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
                      ({g.channels.length} markers)
                    </span>
                  </div>
                  <span className="text-[var(--muted)] text-lg">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-4">
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
                    <div className="space-y-2">
                      {g.channels.map((ch) => {
                        const meta = CHANNELS[ch.name];
                        return (
                          <div
                            key={ch.name}
                            className="flex items-start gap-3 p-2 rounded-md hover:bg-[var(--background)] transition-colors"
                          >
                            <span
                              className="mt-1 w-2 h-2 rounded-full shrink-0"
                              style={{ background: meta?.color ?? color }}
                            />
                            <div>
                              <span className="text-sm font-bold" style={{ color: meta?.color ?? color }}>
                                {ch.name}
                              </span>
                              {meta?.cellType && (
                                <span className="text-xs text-[var(--muted)] ml-2">
                                  ({meta.cellType})
                                </span>
                              )}
                              <p className="text-xs text-[var(--foreground)]/60 mt-0.5">
                                {ch.role}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Spatial patterns */}
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

      {/* GigaTIME approach */}
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
            <span className="font-bold text-[var(--accent)]">Training:</span>{" "}
            Trained on paired H&amp;E and COMET multiplex IF data from thousands of
            tissue sections, using Dice loss + L1 loss + Pearson correlation loss to
            learn both spatial accuracy and statistical consistency.
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

      {/* Glossary */}
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
