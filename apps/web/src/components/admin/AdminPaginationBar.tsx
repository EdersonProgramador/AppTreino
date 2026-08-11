import {
  ChevronLeft,
  ChevronRight
} from "lucide-react";

﻿export function AdminPaginationBar({
  page,
  pageCount,
  totalLabel,
  onPageChange
}: {
  page: number;
  pageCount: number;
  totalLabel: string;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="admin-users-pagination">
      <span>
        Página {page} de {pageCount} • {totalLabel}
      </span>
      <div>
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={17} />
          Anterior
        </button>
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
          Próxima
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
