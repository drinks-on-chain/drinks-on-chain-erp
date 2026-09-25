"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Devuelve el foco al control que abrió un Modal o SlideOver controlado (sin `trigger`).
 * Radix solo lo devuelve a su propio disparador; sin él, el foco acaba en <body>.
 * Se quita cuando @drinks-on-chain/ui restaure el foco por su cuenta.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  // Efecto de layout: corre antes de que el diálogo mueva el foco a su contenido.
  useLayoutEffect(() => {
    if (open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      return;
    }
    const el = opener.current;
    opener.current = null;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      if (el.isConnected) el.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
}
