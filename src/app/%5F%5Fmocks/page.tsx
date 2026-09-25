import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devToolsEnabled } from "@/lib/env";
import { MocksPanel } from "./mocks-panel";

export const metadata: Metadata = { title: "Datos de prueba" };

// /__mocks: solo en desarrollo o en demos con NEXT_PUBLIC_MOCKS=1 (08 §6).
export default function MocksPage() {
  if (!devToolsEnabled) notFound();
  return <MocksPanel />;
}
