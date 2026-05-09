"use client";

import { useQueryState } from "nuqs";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BillFilterBar } from "@/components/bills/BillFilterBar";
import { BillCard } from "@/components/bills/BillCard";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonList } from "@/components/shared/SkeletonCard";
import { useBills } from "@/hooks/useBills";
import { FileText, AlertCircle } from "lucide-react";

export default function BillsPage() {
  const [search] = useQueryState("search", { defaultValue: "" });
  const [statusId] = useQueryState("status_id", { defaultValue: "" });
  const [knessetNum] = useQueryState("knesset_num", { defaultValue: "" });
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: false });

  const currentPage = parseInt(page ?? "1", 10);

  const { data, isLoading, isError } = useBills({
    page: currentPage,
    limit: 20,
    search: search || undefined,
    status_id: statusId ? Number(statusId) : undefined,
    knesset_num: knessetNum ? Number(knessetNum) : undefined,
  });

  const handlePageChange = (p: number) => {
    setPage(String(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {/* Page header */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">הצעות חוק</h1>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.pagination.total.toLocaleString("he-IL")} הצעות חוק
              </p>
            )}
          </div>
        </div>

        {/* Filters */}
        <BillFilterBar className="mb-6" />

        {/* Error */}
        {isError && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">שגיאה בטעינת נתונים</p>
              <p className="text-xs mt-0.5 opacity-80">ודאו שהשרת פועל ונסו לרענן את הדף.</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && <SkeletonList rows={10} />}

        {/* Results */}
        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <div className="py-20 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">לא נמצאו הצעות חוק התואמות את החיפוש.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {data.data.map((bill) => (
                  <BillCard key={bill.bill_id} bill={bill} />
                ))}
              </div>
            )}

            <div className="mt-8">
              <Pagination
                page={currentPage}
                totalPages={data.pagination.total_pages}
                total={data.pagination.total}
                onPageChange={handlePageChange}
              />
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
