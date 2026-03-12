import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata = { title: "חברי כנסת" };

export default function MembersPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">חברי כנסת</h1>
        {/* Phase 3: MKCard grid + search/filter */}
        <p className="text-muted-foreground">רשימת חברי כנסת — תמומש בשלב 3</p>
      </main>
      <Footer />
    </div>
  );
}
