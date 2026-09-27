import { execFile } from "node:child_process";

// Buzón real de las pruebas contra el backend: la API de Mailpit del entorno de desarrollo, donde
// el worker entrega los correos (invitaciones, recuperación). Mailpit solo escucha en 127.0.0.1
// del servidor, así que se llega por uno de estos transportes (los mismos que el repo de e2e):
//
// - `E2E_MAILPIT_URL`: HTTP directo (p. ej. un túnel `ssh -L 8025:127.0.0.1:8025 …`).
// - `E2E_MAILPIT_SSH=<destino ssh>`: `curl` contra 127.0.0.1:8025 en el servidor (uso local, con
//   la llave de la persona). Con `E2E_MAILPIT_SSH_MODE=api`, la llave de CI de comando forzado,
//   que solo admite `GET /api/v1/<ruta>`. `E2E_MAILPIT_SSH_KEY` (opcional): ruta de la llave.
//
// Solo lee: nunca borra correos. Los enlaces se buscan por destinatario (correos únicos por
// ejecución) y fecha, así que otros correos del buzón no molestan.

type Summary = { ID: string; Created: string; Subject: string; To: { Address: string }[] | null };
type Message = { Text: string; HTML: string };

const SAFE_PATH = /^\/api\/v1\/[A-Za-z0-9/_.?=&%-]*$/;

/** Codifica con el juego de caracteres que admite el comando forzado del servidor. */
const encode = (value: string) =>
  Array.from(new TextEncoder().encode(value), (b) => {
    const ch = String.fromCharCode(b);
    return /[A-Za-z0-9_.-]/.test(ch) ? ch : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");

function sshGet(path: string): Promise<string> {
  const target = process.env.E2E_MAILPIT_SSH!.trim();
  const key = process.env.E2E_MAILPIT_SSH_KEY?.trim();
  const api = process.env.E2E_MAILPIT_SSH_MODE?.trim() === "api";
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
  if (key) args.push("-i", key, "-o", "IdentitiesOnly=yes");
  args.push(target, api ? `GET ${path}` : `curl -fsS --max-time 20 'http://127.0.0.1:8025${path}'`);
  return new Promise((resolve, reject) =>
    execFile("ssh", args, { timeout: 45_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(`Mailpit por ssh (${path}): ${stderr.trim() || error.message}`)) : resolve(stdout),
    ),
  );
}

async function get<T>(path: string): Promise<T> {
  if (!SAFE_PATH.test(path)) throw new Error(`Ruta de Mailpit no admitida: ${path}`);
  const url = process.env.E2E_MAILPIT_URL?.trim();
  const raw = url
    ? await fetch(`${url.replace(/\/+$/, "")}${path}`, { signal: AbortSignal.timeout(20_000) }).then((r) => {
        if (!r.ok) throw new Error(`Mailpit GET ${path}: HTTP ${r.status}`);
        return r.text();
      })
    : await sshGet(path);
  return JSON.parse(raw) as T;
}

/** Hay buzón configurado (si no, las pruebas que leen correos se saltan). */
export const hasMailbox = () => Boolean(process.env.E2E_MAILPIT_URL?.trim() || process.env.E2E_MAILPIT_SSH?.trim());

/**
 * Espera el correo más reciente para `to` recibido después de `since` con un enlace que cumpla
 * `pattern`, y devuelve la ruta del enlace dentro de la app (sin el origen: el backend de
 * desarrollo enlaza con la URL pública del ERP, las pruebas corren en localhost).
 */
export async function mailLink(to: string, pattern: RegExp, since: Date, timeoutMs = 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const query = encode(`to:"${to}"`);
  while (Date.now() < deadline) {
    const { messages } = await get<{ messages: Summary[] }>(`/api/v1/search?query=${query}&limit=10`);
    const fresh = messages
      .filter((m) => (m.To ?? []).some((a) => a.Address.toLowerCase() === to.toLowerCase()))
      .filter((m) => new Date(m.Created).getTime() >= since.getTime() - 5_000);
    for (const summary of fresh) {
      const message = await get<Message>(`/api/v1/message/${summary.ID}`);
      const links = [
        ...Array.from((message.HTML ?? "").matchAll(/href="(https?:\/\/[^"]+)"/g), (m) => m[1]!.replace(/&amp;/g, "&")),
        ...Array.from((message.Text ?? "").matchAll(/https?:\/\/[^\s<>"')\]]+/g), (m) => m[0]),
      ];
      const link = links.find((l) => pattern.test(l));
      if (link) {
        const url = new URL(link);
        return `${url.pathname}${url.search}`;
      }
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`No llegó el correo para ${to} (${String(pattern)})`);
}
