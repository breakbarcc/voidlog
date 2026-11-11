"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";
import { Table } from "@radix-ui/themes";
import type { ReactNode } from "react";

export function SortableColumnHeader({
  active,
  direction,
  onClick,
  children,
}: Readonly<{
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <Table.ColumnHeaderCell>
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 text-left ${active ? "text-foreground" : "text-muted-strong hover:text-foreground"}`}
      >
        {children}
        {active ? direction === "asc" ? <ChevronUpIcon /> : <ChevronDownIcon /> : null}
      </button>
    </Table.ColumnHeaderCell>
  );
}
