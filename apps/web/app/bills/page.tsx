"use client";

import { useQueryState } from "nuqs";
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BillFilterBar } from "@/components/bills/BillFilterBar";
import { BillCard } from "@/components/bills/BillCard";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useBills } from "@/hooks/useBills";

export default function BillsPage() {
  const [search] = useQueryState("search", { defaultValue: "" });
  const [statusId] = useQueryState("status_id", { defaultValue: "" });
  const [knessetNum] = useQueryState("knesset_num", { defaultValue: "" });
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: false,
  });

  const currentPage = parseInt(page ?? "1", 10);

  const { data, isLoading, isError } = useBills({
    page: currentPage,
    limit: 24,
    search: search || undefined,
    status_id: statusId ? Number(statusId) : undefined,
    knesset_num: knessetNum ? Number(knessetNum) : undefined,
  });

  const handlePageChange = (p: number) => {
    setPage(String(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">הצעות חוק</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.pagination.total.toLocaleString("he-IL")} הצעות חוק
            </p>
          )}
        </div>

        <BillFilterBar className="mb-6" />

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            שגיאה בטעינת נתונים. אנא נסה שוב.
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                לא נמצאו הצעות חוק התואמות את החיפוש.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
