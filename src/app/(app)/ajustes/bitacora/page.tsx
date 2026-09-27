import type { Metadata } from "next";
import { AuditPage } from "@/features/ajustes/audit-page";

export const metadata: Metadata = { title: "Bitácora" };

export default function Page() {
  return <AuditPage />;
}
