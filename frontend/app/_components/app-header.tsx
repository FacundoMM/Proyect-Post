"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/inventario", label: "Inventario" },
  { href: "/ventas", label: "Ventas" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(29,23,17,0.08)] bg-[rgba(243,236,222,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-sm font-bold text-background">
            PP
          </span>
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Proyecto Post</p>
            <p className="text-base font-semibold text-foreground">
              Inventario y caja
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2 rounded-full border border-[rgba(29,23,17,0.08)] bg-white/65 p-1">
          {links.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-[rgba(29,23,17,0.06)] hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
