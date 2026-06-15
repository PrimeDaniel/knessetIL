import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";
import { dashboardKeys } from "@/hooks/useParties";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { KnessetHemicycle } from "@/components/hero/KnessetHemicycle";
import { HomeDashboard } from "@/components/shared/HomeDashboard";

export default async function HomePage() {
  const queryClient = new QueryClient();

  // Prefetch dashboard stats on the server for instant initial load
  await queryClient.prefetchQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => statsApi.dashboard(),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <KnessetHemicycle />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-5xl">
        <HydrationBoundary state={dehydrate(queryClient)}>
          <HomeDashboard />
        </HydrationBoundary>
      </main>
      <Footer />
    </div>
  );
}
