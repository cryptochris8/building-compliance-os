"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";

interface BuildingsPaginationProps {
  currentPage: number;
  totalPages: number;
}

export function BuildingsPagination({ currentPage, totalPages }: BuildingsPaginationProps) {
  const router = useRouter();

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={(page) => router.push("/buildings?page=" + page)}
    />
  );
}
