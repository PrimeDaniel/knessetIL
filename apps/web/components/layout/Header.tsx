import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Scale } from "lucide-react";

// Navigation items — RTL order (rightmost = first)
const NAV_ITEMS = [
  { href: "/", labelKey: "nav.home" },
  { href: "/bills", labelKey: "nav.bills" },
  { href: "/members", labelKey: "nav.members" },
  { href: "/parties", labelKey: "nav.parties" },
] as const;

export function Header() {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo — rightmost in RTL */}
        <Link href="/" className="flex items-center gap-2 text-primary font-bold text-lg">
          <Scale className="h-5 w-5" />
          <span>שקיפות הכנסת</span>
        </Link>

        {/* Navigation — in RTL, these appear left of logo visually */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map(({ href, labelKey }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "text-sm font-medium text-muted-foreground transition-colors",
                "hover:text-foreground"
              )}
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
