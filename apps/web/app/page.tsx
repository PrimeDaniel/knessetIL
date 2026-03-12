import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HomeDashboard } from "@/components/shared/HomeDashboard";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <HomeDashboard />
      </main>
      <Footer />
    </div>
  );
}
