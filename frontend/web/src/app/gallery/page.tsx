"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchJSON, tileHEUrl, tileChannelUrl, type TileListResponse } from "@/lib/api";
import { CHANNELS, ACTIVE_CHANNELS, CHANNEL_NAMES } from "@/lib/channels";
import { ChannelPicker } from "@/components/ChannelPicker";
import { ImageCompare } from "@/components/ImageCompare";

export default function GalleryPage() {
  const [tiles, setTiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [channel, setChannel] = useState("CK");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJSON<TileListResponse>("/tiles").then((d) => {
      setTiles(d.tiles);
      if (d.tiles.length > 0) setSelected(d.tiles[0]);
      setLoading(false);
    });
  }, []);

  const channelIdx = useMemo(
    () => CHANNEL_NAMES.indexOf(channel as (typeof CHANNEL_NAMES)[number]),
    [channel]
  );

  if (loading) {
    return <div className="text-[var(--muted)] py-12 text-center">Loading tiles…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Sample Gallery</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Browse {tiles.length} H&amp;E tissue patches and compare with virtual protein predictions.
        Drag the slider to reveal the virtual mIF channel.
      </p>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Main view */}
        <div>
          {selected && channelIdx >= 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">
                  <span className="text-[var(--muted)]">Tile:</span> {selected}
                </h2>
                <span className="text-xs text-[var(--muted)]">
                  {CHANNELS[channel]?.cellType}
                </span>
              </div>
              <ImageCompare
                leftSrc={tileHEUrl(selected)}
                rightSrc={tileChannelUrl(selected, channelIdx, "pred")}
                leftLabel="H&E Stain"
                rightLabel={`Virtual ${channel}`}
                height={512}
              />
              <p className="text-xs text-[var(--muted)] mt-3 leading-relaxed">
                <strong className="text-[var(--fg)]">{channel}:</strong>{" "}
                {CHANNELS[channel]?.desc}
              </p>
            </div>
          )}

          {/* Thumbnail grid */}
          <h3 className="text-sm font-semibold mt-6 mb-3 text-[var(--muted)]">
            All Patches
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {tiles.map((t) => (
              <button
                key={t}
                onClick={() => setSelected(t)}
                className="rounded-lg overflow-hidden border-2 transition-all"
                style={{
                  borderColor: t === selected ? "var(--accent)" : "transparent",
                }}
              >
                <img
                  src={tileHEUrl(t)}
                  alt={t}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Channel picker sidebar */}
        <div className="card h-fit sticky top-6">
          <h3 className="text-sm font-bold mb-3">Select Channel</h3>
          <ChannelPicker selected={channel} onChange={setChannel} />
        </div>
      </div>
    </div>
  );
}
