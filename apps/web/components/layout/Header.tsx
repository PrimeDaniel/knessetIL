"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Scale, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/",        label: "ראשי" },
  { href: "/votes",   label: "הצבעות" },
  { href: "/bills",   label: "הצעות חוק" },
  { href: "/members", label: "חברי כנסת" },
  { href: "/parties", label: "סיעות" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-primary font-bold text-lg shrink-0">
          <Scale className="h-5 w-5" />
          <span>שקיפות הכנסת</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "text-primary bg-primary/8"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {label}
              {isActive(href) && (
                <span className="absolute bottom-1.5 inset-x-4 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={() => setOpen(!open)}
          aria-label={open ? "סגור תפריט" : "פתח תפריט"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {open && (
        <div className="md:hidden border-t border-border bg-card px-4 py-3 flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "text-primary bg-primary/8"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
