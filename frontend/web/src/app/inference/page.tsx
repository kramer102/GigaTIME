"use client";

import { useState, useRef, useCallback } from "react";
import { ACTIVE_CHANNELS, CHANNELS, CATEGORY_COLORS, groupByCategory } from "@/lib/channels";

interface InferenceResult {
  images: Record<string, string>; // name → base64 png
  probImages: Record<string, string>;
  channels: { index: number; name: string; positiveRatio: number; meanProbability: number }[];
  inputSize: [number, number];
}

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export default function InferencePage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("DAPI");
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setStage("uploading");
      setError("");
      setResult(null);

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      // Upload
      const form = new FormData();
      form.append("file", file);

      try {
        setStage("processing");
        const resp = await fetch("/api/infer", { method: "POST", body: form });
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(body || `HTTP ${resp.status}`);
        }
        const data: InferenceResult = await resp.json();
        setResult(data);
        setStage("done");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const groups = groupByCategory();
  const order = ["immune", "checkpoint", "tumor", "structural"];
  const channelImg =
    result && selectedChannel ? result.images[selectedChannel] : null;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Live Inference</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Upload an H&amp;E tissue tile and watch GigaTIME predict 23 protein channels
        in real-time using the local model.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="card cursor-pointer border-2 border-dashed border-[var(--card-border)] hover:border-[var(--accent)] transition-colors text-center py-12 mb-6"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/tiff"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {stage === "idle" && (
          <>
            <p className="text-lg font-bold text-[var(--muted)]">
              Drop an H&amp;E image here
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">
              PNG, JPEG, or TIFF — ideally 512×512 or larger
            </p>
          </>
        )}
        {stage === "uploading" && (
          <p className="text-[var(--accent)] animate-pulse">Uploading…</p>
        )}
        {stage === "processing" && (
          <div className="space-y-2">
            <p className="text-[var(--accent)] animate-pulse font-bold">
              Running inference…
            </p>
            <p className="text-xs text-[var(--muted)]">
              Model is predicting 23 protein channels. First run may take longer
              while the model loads.
            </p>
            <div className="w-48 h-1.5 bg-[var(--card-border)] rounded-full mx-auto mt-3 overflow-hidden">
              <div className="h-full bg-[var(--accent)] rounded-full animate-[progress_2s_ease-in-out_infinite]" />
            </div>
          </div>
        )}
        {stage === "error" && (
          <div>
            <p className="text-red-400 font-bold">Error</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
            <p className="text-xs text-[var(--muted)] mt-2">
              Click to try again
            </p>
          </div>
        )}
        {stage === "done" && (
          <p className="text-[var(--muted)]">
            Done! Click to upload a different image.
          </p>
        )}
      </div>

      {/* Results */}
      {result && preview && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          {/* Main viewer */}
          <div className="space-y-4">
            {/* Overlay viewer */}
            <div className="card">
              <h3 className="text-sm font-bold mb-3">
                H&amp;E + {selectedChannel} Overlay
              </h3>
              <div className="relative w-full aspect-square max-w-lg mx-auto rounded-lg overflow-hidden bg-black">
                <img
                  src={preview}
                  alt="H&E input"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {channelImg && (
                  <img
                    src={`data:image/png;base64,${channelImg}`}
                    alt={selectedChannel}
                    className="absolute inset-0 w-full h-full object-cover mix-blend-screen"
                    style={{ opacity: overlayOpacity }}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs text-[var(--muted)]">Overlay</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(+e.target.value)}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="text-xs font-mono w-8 text-right">
                  {(overlayOpacity * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Thumbnail grid of all channels */}
            <div className="card">
              <h3 className="text-sm font-bold mb-3">All Channels</h3>
              <div className="channel-grid">
                {ACTIVE_CHANNELS.map((name) => {
                  const img = result.images[name];
                  if (!img) return null;
                  const ch = CHANNELS[name];
                  const color = ch ? CATEGORY_COLORS[ch.category] : "#888";
                  const active = selectedChannel === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedChannel(name)}
                      className="text-left rounded-lg overflow-hidden transition-all"
                      style={{
                        outline: active
                          ? `2px solid ${color}`
                          : "2px solid transparent",
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${img}`}
                        alt={name}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="px-1.5 py-1 bg-[var(--card)]">
                        <span className="text-[0.6rem] font-bold" style={{ color }}>
                          {name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Channel picker sidebar */}
          <div className="space-y-3">
            <div className="card sticky top-4">
              <h3 className="text-xs font-bold text-[var(--muted)] mb-3 uppercase tracking-wider">
                Select Channel
              </h3>
              {order.map((cat) => {
                const names = groups[cat] ?? [];
                const color = CATEGORY_COLORS[cat];
                return (
                  <div key={cat} className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: color }}
                      />
                      <span
                        className="text-[0.6rem] font-bold uppercase"
                        style={{ color }}
                      >
                        {cat}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {names.map((n) => (
                        <button
                          key={n}
                          onClick={() => setSelectedChannel(n)}
                          className="px-2 py-0.5 rounded text-[0.6rem] font-medium transition-all"
                          style={{
                            background:
                              selectedChannel === n ? color : "var(--background)",
                            color: selectedChannel === n ? "#000" : color,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tips section */}
      <section className="card mt-8">
        <h3 className="text-sm font-bold mb-2">Tips</h3>
        <ul className="text-xs text-[var(--foreground)]/70 space-y-1 list-disc list-inside">
          <li>
            For best results, use 512×512 pixel tiles from the 20× magnification
            level.
          </li>
          <li>
            The first inference may take 10-30 seconds while the model loads into
            memory. Subsequent runs will be faster.
          </li>
          <li>
            Input images are automatically resized and normalized before inference.
          </li>
          <li>
            Use the overlay slider to compare the H&amp;E morphology with predicted
            protein expression.
          </li>
          <li>
            Click any channel thumbnail to inspect it in the overlay viewer above.
          </li>
        </ul>
      </section>
    </div>
  );
}
