"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

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
  const router = useRouter();
  const { user, signOut } = useSupabaseAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const links = [
    { href: `/league/${code}/dashboard`, label: "Asta" },
    { href: `/league/${code}/classifica`, label: "Classifica" },
    ...(isAdmin ? [{ href: `/league/${code}/admin`, label: "Admin" }] : []),
  ];

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-black text-lg whitespace-nowrap">
            ⚽ ASTA FANTACALCIO
          </Link>
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
            <div className="relative ml-2" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-xs text-slate-300 border-l border-slate-800 pl-3 pr-2 py-1.5 flex items-center gap-1 hover:text-white"
              >
                {displayName} <span className="text-slate-500">▾</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-slate-800 bg-slate-900 shadow-xl py-1 text-sm">
                  {user?.email && (
                    <p className="px-3 py-1.5 text-xs text-slate-500 truncate border-b border-slate-800 mb-1">{user.email}</p>
                  )}
                  <Link
                    href="/"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-1.5 text-slate-300 hover:bg-slate-800"
                  >
                    Le mie leghe
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-3 py-1.5 text-rose-400 hover:bg-slate-800"
                  >
                    Esci
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
