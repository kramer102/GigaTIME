"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/gallery", label: "Gallery", icon: "🖼️" },
  { href: "/explorer", label: "Channel Explorer", icon: "🔬" },
  { href: "/biology", label: "Biology Guide", icon: "🧬" },
  { href: "/metrics", label: "Metrics", icon: "📊" },
  { href: "/inference", label: "Live Inference", icon: "⚡" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#111] border-r border-[var(--card-border)] flex flex-col z-50">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 border-b border-[var(--card-border)]">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-[var(--accent)]">Giga</span>TIME
        </h1>
        <p className="text-[0.68rem] text-[var(--muted)] mt-0.5 leading-snug">
          Virtual Multiplex IF Explorer
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-auto">
        {NAV.map(({ href, label, icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-[var(--accent-dim)]/20 text-[var(--accent)] font-medium"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              )}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--card-border)] text-[0.65rem] text-[var(--muted)]">
        <p>Providence / Microsoft Research</p>
        <p className="mt-0.5">GigaTIME &middot; Cell 2026</p>
      </div>
    </aside>
  );
}
