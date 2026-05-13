import type { Metadata } from "next";
import { Heebo, Noto_Serif_Hebrew, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ReactQueryProvider } from "@/components/shared/ReactQueryProvider";
import "./globals.css";

// ── Hebrew primary font ───────────────────────────────────────────────────────
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

// ── Serif font for editorial headings ─────────────────────────────────────────
const notoSerifHebrew = Noto_Serif_Hebrew({
  subsets: ["hebrew"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// ── Mono font for data labels and numbers ─────────────────────────────────────
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "שקיפות הכנסת",
    template: "%s | שקיפות הכנסת",
  },
  description: "עקבו אחרי הצבעות, חוקים וחברי כנסת — הכל במקום אחד. נתוני כנסת ישראל בשקיפות מלאה.",
  keywords: ["כנסת", "הצעות חוק", "חברי כנסת", "הצבעות", "שקיפות"],
  authors: [{ name: "KnessetIL" }],
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: "שקיפות הכנסת",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    // RTL is set at the HTML root — all Tailwind logical properties flow from here
    <html lang="he" dir="rtl" className={`dark ${heebo.variable} ${notoSerifHebrew.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans min-h-screen bg-background antialiased">
        <NextIntlClientProvider messages={messages}>
          <ReactQueryProvider>
            {children}
          </ReactQueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
