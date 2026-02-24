"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  leftSrc: string;
  rightSrc: string;
  leftLabel?: string;
  rightLabel?: string;
  height?: number;
}

export function ImageCompare({
  leftSrc,
  rightSrc,
  leftLabel = "H&E",
  rightLabel = "Virtual mIF",
  height = 512,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50); // percent
  const dragging = useRef(false);

  const onMove = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current) onMove(e.clientX);
    };
    const onMouseUp = () => { dragging.current = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (dragging.current) onMove(e.touches[0].clientX);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [onMove]);

  return (
    <div className="relative select-none" style={{ maxWidth: height }}>
      {/* Labels */}
      <div className="flex justify-between text-xs text-[var(--muted)] mb-1 px-1">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div
        ref={containerRef}
        className="compare-container"
        style={{ height, aspectRatio: "1" }}
        onMouseDown={() => { dragging.current = true; }}
        onTouchStart={() => { dragging.current = true; }}
      >
        {/* Right (bottom layer) */}
        <img
          src={rightSrc}
          alt={rightLabel}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          draggable={false}
        />
        {/* Left (clip) */}
        <div
          className="compare-overlay"
          style={{ width: `${pos}%` }}
        >
          <img
            src={leftSrc}
            alt={leftLabel}
            style={{ width: `${(100 / pos) * 100}%`, maxWidth: "none", height: "100%", objectFit: "cover" }}
            draggable={false}
          />
        </div>
        {/* Slider bar */}
        <div className="compare-slider" style={{ left: `${pos}%` }} />
      </div>
    </div>
  );
}
