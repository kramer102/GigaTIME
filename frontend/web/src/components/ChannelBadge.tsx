"use client";

import { CHANNELS, CATEGORY_COLORS, BACKGROUND_CHANNELS } from "@/lib/channels";

interface Props {
  name: string;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function ChannelBadge({ name, selected, onClick, size = "sm" }: Props) {
  if (BACKGROUND_CHANNELS.has(name)) return null;
  const meta = CHANNELS[name];
  if (!meta) return null;

  const bg = CATEGORY_COLORS[meta.category] ?? "#868e96";

  return (
    <button
      onClick={onClick}
      className="tooltip-trigger"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: size === "sm" ? "0.72rem" : "0.82rem",
        fontWeight: 600,
        padding: size === "sm" ? "0.15rem 0.55rem" : "0.25rem 0.7rem",
        borderRadius: "999px",
        border: selected ? `2px solid ${bg}` : "1px solid rgba(255,255,255,0.1)",
        background: selected ? `${bg}20` : "transparent",
        color: selected ? bg : "var(--muted)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: bg,
          flexShrink: 0,
        }}
      />
      {name}
      <span className="tooltip-text">{meta.desc}</span>
    </button>
  );
}
