"use client";

import { EmptyState } from "@drinks-on-chain/ui";
import { PageChrome } from "./page-chrome";

/** Página provisional de un módulo que aún no está construido. */
export function PendingModule({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="grid gap-6">
      <PageChrome breadcrumbs={[{ label: title }]} />
      <h1 className="font-display text-3xl">{title}</h1>
      <EmptyState title="Módulo en construcción" description={`Llega en la sub-etapa ${stage} del roadmap del ERP.`} />
    </div>
  );
}
