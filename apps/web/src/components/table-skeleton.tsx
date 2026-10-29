/** Placeholder for a data table while its rows load: a header line and `rows` pulsing rows. */
export function TableSkeleton({
  columns,
  rows = 10,
}: Readonly<{ columns: number; rows?: number }>) {
  return (
    <div className="border-line bg-surface overflow-hidden rounded-md border">
      {Array.from({ length: rows + 1 }, (_, row) => (
        <div
          key={row}
          className={`border-line-soft flex gap-6 px-4 ${row === 0 ? "bg-surface-2/40 py-3" : "border-t py-4"}`}
        >
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              className={`bg-surface-2 h-3 animate-pulse rounded-sm ${column === 0 ? "w-40 shrink-0" : "flex-1"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
