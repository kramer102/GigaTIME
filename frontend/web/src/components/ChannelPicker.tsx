"use client";

import { CHANNELS, ACTIVE_CHANNELS, CATEGORY_COLORS, CATEGORY_LABELS, groupByCategory } from "@/lib/channels";

interface Props {
  selected: string;
  onChange: (name: string) => void;
}

export function ChannelPicker({ selected, onChange }: Props) {
  const groups = groupByCategory();
  const order = ["immune", "checkpoint", "tumor", "structural"];

  return (
    <div className="space-y-3">
      {order.map((cat) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: CATEGORY_COLORS[cat] }}
            />
            <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
              {CATEGORY_LABELS[cat]}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(groups[cat] ?? []).map((name) => {
              const active = name === selected;
              const color = CATEGORY_COLORS[cat];
              return (
                <button
                  key={name}
                  onClick={() => onChange(name)}
                  className="tooltip-trigger"
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "999px",
                    border: active ? `2px solid ${color}` : "1px solid rgba(255,255,255,0.1)",
                    background: active ? `${color}22` : "transparent",
                    color: active ? color : "var(--muted)",
                    cursor: "pointer",
                    transition: "all 0.12s",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {name}
                  <span className="tooltip-text">
                    {CHANNELS[name]?.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
