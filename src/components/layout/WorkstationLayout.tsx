"use client";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface WorkstationLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  fullBleed?: boolean;
}

export default function WorkstationLayout({
  children,
  activeTab = "OVERVIEW",
  fullBleed = false,
}: WorkstationLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className={`flex-1 min-h-0 ${fullBleed ? "overflow-hidden" : "overflow-y-auto p-8 custom-scroll"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
