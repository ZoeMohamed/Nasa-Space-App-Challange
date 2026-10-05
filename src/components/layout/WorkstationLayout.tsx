"use client";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface WorkstationLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
}

export default function WorkstationLayout({
  children,
  activeTab = "OVERVIEW",
}: WorkstationLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-[#f9fafb] text-[#101828] font-sans">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8 custom-scroll">
          {children}
        </main>
      </div>
    </div>
  );
}
