"use client";

import { useState } from "react";
import type { ModalState } from "@/types";
import ActionModal from "@/components/ui/ActionModal";
import NavBar from "@/components/layout/NavBar";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import StatusBar from "@/components/layout/StatusBar";

interface WorkstationLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
}

export default function WorkstationLayout({
  children,
  activeTab = "OVERVIEW",
}: WorkstationLayoutProps) {
  const [syncing, setSyncing] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    title: "",
    message: "",
    type: "hazard",
  });

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1200);
  };

  const triggerHazard = () => {
    setModalState({
      open: true,
      title: "IMMEDIATE HAZARD ESCALATION TRIGGER",
      message:
        "Initiating emergency sensor tasking across NOAA-20 and Suomi-NPP VIIRS instruments for high-severity hotspots in Sumatra & Kalimantan.",
      type: "hazard",
    });
  };

  const triggerEscalation = () => {
    setModalState({
      open: true,
      title: "EMERGENCY DAOPS ESCALATION",
      message:
        "Transmitting critical priority coordinates directly to Manggala Agni regional field dispatch headquarters.",
      type: "danger",
    });
  };

  const closeModal = () =>
    setModalState((prev) => ({ ...prev, open: false }));

  return (
    <div className="w-full max-w-[1600px] bg-surface-container-lowest rounded-lg border border-outline-variant shadow-2xl overflow-hidden flex flex-col min-h-[920px]">
      {/* OS Window Header */}
      <TopBar activeTab={activeTab} />

      {/* Top Navigation Bar */}
      <NavBar
        activeTab={activeTab}
        syncing={syncing}
        onSync={handleSync}
        onEscalation={triggerEscalation}
      />

      {/* Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar activeTab={activeTab} onHazard={triggerHazard} />

        {/* Main Content */}
        <main className="flex-1 bg-surface-container-lowest overflow-y-auto flex flex-col">
          {children}
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Modal */}
      <ActionModal
        isOpen={modalState.open}
        onClose={closeModal}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
}
