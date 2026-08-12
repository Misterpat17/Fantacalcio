"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopBar({
  code,
  leagueName,
  isAdmin,
  displayName,
}: {
  code: string;
  leagueName?: string;
  isAdmin: boolean;
  displayName?: string;
}) {
  const pathname = usePathname();

  const links = [
    { href: `/league/${code}/dashboard`, label: "Asta" },
    { href: `/league/${code}/classifica`, label: "Classifica" },
    ...(isAdmin ? [{ href: `/league/${code}/admin`, label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-black text-lg whitespace-nowrap">⚽ ASTA FANTACALCIO</span>
          <span className="text-slate-500 text-sm truncate hidden sm:inline">
            {leagueName ? `${leagueName} · ` : ""}
            <span className="font-mono text-slate-400">{code}</span>
          </span>
        </div>
        <nav className="flex items-center gap-1.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                pathname === l.href ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {displayName && (
            <span className="hidden md:inline text-xs text-slate-500 ml-2 border-l border-slate-800 pl-3">{displayName}</span>
          )}
        </nav>
      </div>
    </header>
  );
}
