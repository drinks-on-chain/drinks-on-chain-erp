"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconButton, cn, toast } from "@drinks-on-chain/ui";
import { shortHash } from "@/lib/format";

// Direcciones y hashes de Stellar (testnet): monoespaciada, abreviada, con copia y enlace
// al explorador. Los usan la cuenta de la bodega, el embotellado y el perfil.

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const explorerTxUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAccountUrl = (key: string) => `${EXPLORER}/account/${key}`;

export function HashText({
  value,
  head = 6,
  tail = 6,
  full = false,
  label = "Copiar",
  className,
}: {
  value: string;
  head?: number;
  tail?: number;
  /** Muestra el valor completo (con salto de línea) en lugar de abreviado. */
  full?: boolean;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copiado al portapapeles", tone: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "No se pudo copiar", description: value, tone: "warning" });
    }
  };
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      <code className={cn("font-mono text-sm", full ? "break-all" : "whitespace-nowrap")} title={value}>
        {full ? value : shortHash(value, head, tail)}
      </code>
      <IconButton label={`${label}: ${value}`} size="sm" variant="ghost" onClick={copy}>
        {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
      </IconButton>
    </span>
  );
}

/** Enlace externo con la flecha ↗ (se abre en otra pestaña). */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-accent-text text-sm font-medium underline-offset-4 hover:underline", className)}
    >
      {children} <span aria-hidden>↗</span>
    </a>
  );
}
