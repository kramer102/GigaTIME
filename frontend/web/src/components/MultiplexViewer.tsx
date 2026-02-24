"use client";

import { useState, useMemo } from "react";
import { tileHEUrl, tileChannelUrl } from "@/lib/api";
import { CHANNEL_NAMES, CATEGORY_COLORS, groupByCategory } from "@/lib/channels";

interface MultiplexViewerProps {
  tile: string;
}

export default function MultiplexViewer({ tile }: MultiplexViewerProps) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});

  const groups = useMemo(() => groupByCategory(), []);
  const order = ["immune", "checkpoint", "tumor", "structural"];

  const toggleChannel = (name: string) => {
    if (selectedChannels.includes(name)) {
      setSelectedChannels(selectedChannels.filter((c) => c !== name));
      const newColors = { ...channelColors };
      delete newColors[name];
      setChannelColors(newColors);
    } else {
      if (selectedChannels.length >= 5) {
        alert("You can select up to 5 channels at a time.");
        return;
      }
      setSelectedChannels([...selectedChannels, name]);
      // Assign a default color based on category or random
      const cat = Object.keys(groups).find((k) => groups[k].includes(name));
      setChannelColors({ ...channelColors, [name]: cat ? CATEGORY_COLORS[cat] : "#ffffff" });
    }
  };

  const updateColor = (name: string, color: string) => {
    setChannelColors({ ...channelColors, [name]: color });
  };

  return (
    <div className="card p-4 mb-8">
      <h2 className="text-lg font-bold mb-2">Multiplex Viewer</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Select up to 5 channels to overlay on the H&E image. Assign custom colors to each channel to visualize co-localization.
      </p>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Viewer */}
        <div className="flex-1">
          <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden border border-[var(--card-border)]">
            {/* H&E Background */}
            <img
              src={tileHEUrl(tile)}
              alt="H&E"
              className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale"
            />
            
            {/* Selected Channels */}
            {selectedChannels.map((name) => {
              const idx = CHANNEL_NAMES.indexOf(name as any);
              const color = channelColors[name];
              
              return (
                <div
                  key={name}
                  className="absolute inset-0 w-full h-full mix-blend-screen"
                >
                  <div className="relative w-full h-full">
                    <img
                      src={tileChannelUrl(tile, idx, "prob")}
                      alt={name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 w-full h-full mix-blend-multiply"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="w-full md:w-64 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Selected Channels</h3>
            {selectedChannels.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No channels selected.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedChannels.map((name) => (
                  <div key={name} className="flex items-center justify-between bg-[var(--background)] p-2 rounded border border-[var(--card-border)]">
                    <span className="text-xs font-medium">{name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={channelColors[name]}
                        onChange={(e) => updateColor(name, e.target.value)}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                      />
                      <button
                        onClick={() => toggleChannel(name)}
                        className="text-[var(--muted)] hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            <h3 className="text-sm font-semibold mb-2">Available Channels</h3>
            {order.map((cat) => {
              const chNames = groups[cat];
              if (!chNames?.length) return null;
              return (
                <div key={cat} className="mb-3">
                  <div className="text-[0.65rem] font-bold uppercase text-[var(--muted)] mb-1">
                    {cat}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {chNames.map((name) => {
                      const isSelected = selectedChannels.includes(name);
                      return (
                        <button
                          key={name}
                          onClick={() => toggleChannel(name)}
                          className={`px-2 py-1 text-[0.65rem] rounded border transition-colors ${
                            isSelected
                              ? "bg-[var(--accent)] border-[var(--accent)] text-black"
                              : "bg-[var(--card)] border-[var(--card-border)] hover:border-[var(--muted)]"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}