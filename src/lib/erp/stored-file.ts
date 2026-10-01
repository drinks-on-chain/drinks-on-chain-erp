// Archivos privados del backend (O0-BE-5): los registros guardan la clave del almacenamiento
// (`org/<organización>/<carpeta>/<aaaa>/<mm>/<uuid>.<ext>`) en sus campos `*Url`; la URL firmada
// se pide al mostrarlos. Los registros anteriores (semilla, mocks antiguos) guardan una URL o una
// ruta absoluta, que se enlaza tal cual.

/** `true` si la referencia es una clave del almacenamiento (y no una URL o ruta absoluta). */
export function isStorageKey(ref: string): boolean {
  return !/^(https?:)?\/\//i.test(ref) && !ref.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

/** Nombre legible del archivo: el último segmento de la clave o la URL, sin la consulta. */
export function storedFileName(ref: string): string {
  const last = ref.split("?")[0]!.split("/").at(-1) ?? ref;
  try {
    return decodeURIComponent(last).replace(/^\d+-/, "");
  } catch {
    return last;
  }
}
