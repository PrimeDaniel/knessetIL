import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata = { title: "הצעות חוק" };

export default function BillsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">הצעות חוק</h1>
        {/* Phase 3: BillsTable + BillFilterBar components */}
        <p className="text-muted-foreground">רשימת הצעות חוק — תמומש בשלב 3</p>
      </main>
      <Footer />
    </div>
  );
}
