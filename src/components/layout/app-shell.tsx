"use client";

import { Suspense, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";

export function AppShell({
  children,
  userName,
  householdName,
}: {
  children: ReactNode;
  userName: string;
  householdName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={userName}
        householdName={householdName}
      />
      <div className="lg:pl-[264px]">
        <Suspense
          fallback={<div className="h-16 border-b border-border bg-background" aria-hidden />}
        >
          <Topbar onOpenMenu={() => setMenuOpen(true)} userName={userName} />
        </Suspense>
        <main className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-24 sm:px-6 sm:pt-6 lg:pb-6">
          {children}
        </main>
      </div>
      <MobileNav onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
