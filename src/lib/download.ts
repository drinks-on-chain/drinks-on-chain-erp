/**
 * Guarda en el equipo un archivo ya descargado con la sesión de la app (CSV de códigos o de
 * reportes, JSON canónico del expediente). El enlace temporal se libera en cuanto se usa.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Tras el clic el navegador ya tiene el contenido; se libera en el siguiente ciclo.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
