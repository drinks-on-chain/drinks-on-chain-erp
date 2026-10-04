"use client";

import { useEffect, useState } from "react";

/** Valor que solo cambia cuando deja de moverse durante `ms` (búsquedas y vistas previas del servidor). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
