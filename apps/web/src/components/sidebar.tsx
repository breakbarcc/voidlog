"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

interface SidebarProps {
  userName: string;
  currentProject?: {
    id: string;
    name: string;
  };
}

function NavLink({
  href,
  active,
  children,
}: Readonly<{
  href: string;
  active: boolean;
  children: ReactNode;
}>) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm font-medium ${
        active ? "bg-primary/15 text-accent" : "text-muted-strong hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

const NAV_DOT_RADIUS: Record<"square" | "circle" | "diamond", string> = {
  square: "rounded-[2px]",
  circle: "rounded-full",
  diamond: "rotate-45",
};

function NavDot({ shape = "square" }: Readonly<{ shape?: "square" | "circle" | "diamond" }>) {
  return <span className={`h-2 w-2 shrink-0 bg-current opacity-70 ${NAV_DOT_RADIUS[shape]}`} />;
}

export function Sidebar({ userName, currentProject }: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");

  return (
    <aside className="bg-surface-2 border-line-soft flex h-full w-[232px] shrink-0 flex-col overflow-y-auto border-r px-3.5 py-5">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
        <span className="bg-primary h-[18px] w-[18px] [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
        <span className="font-heading text-base font-bold tracking-wide">VOIDLOG</span>
      </Link>

      <div className="text-muted mb-2 px-2 text-[11px] font-medium uppercase tracking-wide">
        {t("overview")}
      </div>
      <NavLink href="/" active={pathname === "/"}>
        <NavDot />
        {t("projects")}
      </NavLink>

      {currentProject ? (
        <>
          <div className="text-muted mb-2 mt-5 px-2 text-[11px] font-medium uppercase tracking-wide">
            {t("currentProject")}
          </div>
          <div className="border-line bg-surface mb-3.5 rounded-sm border px-3 py-2.5">
            <div className="text-foreground truncate text-[12.5px] font-semibold">
              {currentProject.name}
            </div>
          </div>
          <NavLink
            href={`/projects/${currentProject.id}`}
            active={pathname === `/projects/${currentProject.id}`}
          >
            <NavDot shape="diamond" />
            {t("history")}
          </NavLink>
          <NavLink
            href={`/projects/${currentProject.id}/players`}
            active={pathname === `/projects/${currentProject.id}/players`}
          >
            <NavDot shape="circle" />
            {t("roster")}
          </NavLink>
          <Link
            href={`/projects/${currentProject.id}/batches/new`}
            className="bg-primary/10 text-primary hover:bg-primary/15 mt-3.5 flex items-center justify-center gap-2 rounded-sm px-2.5 py-2 text-sm font-semibold"
          >
            {t("uploadLogs")}
          </Link>
        </>
      ) : null}

      <div className="flex-1" />

      <div className="mb-2 px-2">
        <LanguageSwitcher />
      </div>

      <button
        type="button"
        onClick={() => signOut({ redirectTo: "/login" })}
        className="text-muted hover:text-foreground flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[12.5px]"
      >
        <span className="bg-line h-[22px] w-[22px] shrink-0 rounded-full" />
        <span className="truncate">{userName}</span>
      </button>
    </aside>
  );
}
