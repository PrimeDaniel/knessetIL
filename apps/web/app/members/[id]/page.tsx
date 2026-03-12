import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function MemberProfilePage({ params }: { params: { id: string } }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">פרופיל חבר/ת כנסת</h1>
        {/* Phase 3: MKProfile + RebellionRateGauge + VotingHistoryTable */}
        <p className="text-muted-foreground">פרופיל חבר/ת כנסת #{params.id} — תמומש בשלב 3</p>
      </main>
      <Footer />
    </div>
  );
}
