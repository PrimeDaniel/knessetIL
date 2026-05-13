import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { KnessetHemicycle } from "@/components/hero/KnessetHemicycle";
import { HomeDashboard } from "@/components/shared/HomeDashboard";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <KnessetHemicycle />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-5xl">
        <HomeDashboard />
      </main>
      <Footer />
    </div>
  );
}
