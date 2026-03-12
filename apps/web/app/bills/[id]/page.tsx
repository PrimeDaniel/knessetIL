import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function BillDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">הצעת חוק #{params.id}</h1>
        {/* Phase 3: BillDetail + VoteBreakdownBar components */}
        <p className="text-muted-foreground">פרטי הצעת חוק — תמומש בשלב 3</p>
      </main>
      <Footer />
    </div>
  );
}
