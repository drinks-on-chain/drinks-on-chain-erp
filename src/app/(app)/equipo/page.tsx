import type { Metadata } from "next";
import { TeamPage } from "@/features/equipo/team-page";

export const metadata: Metadata = { title: "Equipo" };

export default function Page() {
  return <TeamPage />;
}
