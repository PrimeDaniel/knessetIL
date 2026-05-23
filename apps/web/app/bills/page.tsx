"use client";

import { useState } from "react";
import { useQueryState } from "nuqs";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BillFilterBar } from "@/components/bills/BillFilterBar";
import { BillCard } from "@/components/bills/BillCard";
import { BillModal } from "@/components/bills/BillModal";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonList } from "@/components/shared/SkeletonCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useBills } from "@/hooks/useBills";
import { FileText } from "lucide-react";

export default function BillsPage() {
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
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
        <div className="mb-6 flex items-end justify-between gap-4 animate-fade-up">
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

        {isError && <ErrorState className="mb-4" />}

        {/* Loading */}
        {isLoading && <SkeletonList rows={10} />}

        {/* Results */}
        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <EmptyState icon={FileText} message="לא נמצאו הצעות חוק התואמות את החיפוש." />
            ) : (
              <div className="flex flex-col gap-2">
                {data.data.map((bill, i) => (
                  <div key={bill.bill_id} className="animate-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                    <BillCard bill={bill} onSelect={setSelectedBillId} />
                  </div>
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
      {selectedBillId && (
        <BillModal billId={selectedBillId} onClose={() => setSelectedBillId(null)} />
      )}
    </div>
  );
}
