import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">
          <span className="text-[var(--accent)]">Giga</span>TIME Explorer
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
          Explore how a single H&amp;E stained tissue slide can reveal an entire
          landscape of 21 protein biomarkers through{" "}
          <strong className="text-[var(--fg)]">virtual multiplexed immuno&shy;fluorescence</strong>.
        </p>
      </section>

      {/* What is this */}
      <section className="card mb-8">
        <h2 className="text-xl font-bold mb-3">What is Virtual Staining?</h2>
        <div className="grid md:grid-cols-3 gap-6 text-sm leading-relaxed text-[var(--muted)]">
          <div>
            <div className="text-3xl mb-2">🔬</div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">H&amp;E Staining</h3>
            <p>
              Hematoxylin &amp; Eosin (H&amp;E) is the standard, inexpensive stain
              used in every pathology lab. It shows tissue structure — nuclei in
              blue/purple, cytoplasm in pink — but cannot identify specific
              proteins or cell types.
            </p>
          </div>
          <div>
            <div className="text-3xl mb-2">✨</div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              Multiplex IF (mIF)
            </h3>
            <p>
              Multiplexed immunofluorescence uses antibodies tagged with fluorescent
              labels to simultaneously measure 20+ proteins in a single tissue
              section. It reveals the tumor microenvironment — but costs $500+
              per slide and requires specialized equipment.
            </p>
          </div>
          <div>
            <div className="text-3xl mb-2">🤖</div>
            <h3 className="font-semibold text-[var(--fg)] mb-1">
              GigaTIME (Virtual mIF)
            </h3>
            <p>
              A UNet++ deep learning model trained on 14,000+ paired H&amp;E / mIF
              whole-slide images. It predicts 21 protein biomarker maps directly
              from routine H&amp;E — democratizing spatial proteomics at scale.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline diagram */}
      <section className="card mb-8">
        <h2 className="text-xl font-bold mb-4">How It Works</h2>
        <div className="flex items-center justify-center gap-3 flex-wrap text-sm">
          <Step label="H&E Patch" sub="556 × 556 px" color="#f472b6" />
          <Arrow />
          <Step label="Resize + Normalize" sub="512 × 512, ImageNet stats" color="#a78bfa" />
          <Arrow />
          <Step label="UNet++ (GigaTIME)" sub="Sliding 256×256 windows" color="#4dabf7" />
          <Arrow />
          <Step label="Sigmoid → Threshold" sub="Per-pixel probability" color="#38bdf8" />
          <Arrow />
          <Step label="21 Protein Maps" sub="Binary spatial proteomics" color="#51cf66" />
        </div>
      </section>

      {/* Source Materials */}
      <section className="card mb-8">
        <h2 className="text-xl font-bold mb-3">Source Materials</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <ExtLink
            href="https://www.cell.com/cell/fulltext/S0092-8674(24)01396-3"
            icon="📄"
            title="Paper (Cell)"
            desc="Multimodal AI generates virtual population for tumor microenvironment modeling"
          />
          <ExtLink
            href="https://www.microsoft.com/en-us/research/blog/gigatime-scaling-tumor-microenvironment-modeling-using-virtual-population-generated-by-multimodal-ai/"
            icon="📝"
            title="Microsoft Research Blog"
            desc="GigaTIME: Scaling tumor microenvironment modeling using virtual population"
          />
          <ExtLink
            href="https://github.com/prov-gigatime/GigaTIME"
            icon="💻"
            title="Source Repository"
            desc="Original GigaTIME codebase — training, evaluation, and model architecture"
          />
          <ExtLink
            href="https://huggingface.co/prov-gigatime/GigaTIME"
            icon="🤗"
            title="Model (Hugging Face)"
            desc="Pre-trained GigaTIME UNet++ model weights and card"
          />
          <ExtLink
            href="https://github.com/kramer102/GigaTIME/tree/exploratory_dashboard"
            icon="🚀"
            title="This Dashboard (GitHub)"
            desc="Exploratory dashboard branch — the code powering this app"
          />
        </div>
      </section>

      {/* Quick links */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NavCard
          href="/gallery"
          icon="🖼️"
          title="Gallery"
          desc="Browse sample tiles and compare H&E with virtual protein channels"
        />
        <NavCard
          href="/explorer"
          icon="🔬"
          title="Channel Explorer"
          desc="Deep-dive into all 21 channels with ground-truth comparison"
        />
        <NavCard
          href="/biology"
          icon="🧬"
          title="Biology Guide"
          desc="Learn about the tumor microenvironment, immune cells, and checkpoints"
        />
        <NavCard
          href="/metrics"
          icon="📊"
          title="Metrics Dashboard"
          desc="Pearson correlations, box metrics, and per-channel accuracy"
        />
        <NavCard
          href="/inference"
          icon="⚡"
          title="Live Inference"
          desc="Upload your own H&E patch and see instant virtual staining"
        />
      </section>
    </div>
  );
}

function Step({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <div
      className="card text-center min-w-[120px]"
      style={{ borderColor: color, borderWidth: 2 }}
    >
      <div className="font-semibold text-sm" style={{ color }}>
        {label}
      </div>
      <div className="text-[0.65rem] text-[var(--muted)] mt-0.5">{sub}</div>
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-[var(--muted)] text-lg select-none">→</span>
  );
}

function NavCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card block hover:border-[var(--accent)] transition-colors group"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-bold text-sm group-hover:text-[var(--accent)] transition-colors">
        {title}
      </h3>
      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{desc}</p>
    </Link>
  );
}

function ExtLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--card-bg)] transition-colors group"
    >
      <span className="text-xl shrink-0">{icon}</span>
      <div>
        <h3 className="font-semibold text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">
          {title}
          <span className="ml-1 text-[var(--muted)] text-xs">↗</span>
        </h3>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </a>
  );
}
