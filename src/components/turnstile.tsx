"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@drinks-on-chain/ui";
import { MOCK_CAPTCHA_TOKEN, captchaMode } from "@/lib/env";

// Cloudflare Turnstile para los formularios públicos (contrato de la Ola 1 §0, `captchaToken`).
// Carga el script de Cloudflare solo cuando hace falta; con mocks y sin clave entrega un valor de
// prueba sin cargar nada. Para pedir un token nuevo tras un envío fallido, cambia la `key`.

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      language?: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile no cargó")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile no cargó"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const mode = captchaMode();
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callback.current = onToken;
  });

  const siteKey = mode.kind === "turnstile" ? mode.siteKey : null;

  useEffect(() => {
    if (mode.kind === "mock") {
      callback.current(MOCK_CAPTCHA_TOKEN);
      return;
    }
    if (!siteKey || !container.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId = api.render(container.current, {
          sitekey: siteKey,
          language: "es",
          theme: "light",
          size: "flexible",
          callback: (token) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      callback.current(null);
    };
  }, [mode.kind, siteKey]);

  if (mode.kind === "mock") return null;
  if (mode.kind === "missing") {
    return <Alert tone="warning">La verificación anti-robots no está configurada. Inténtalo más tarde.</Alert>;
  }
  return (
    <div className="grid gap-2">
      <div ref={container} className="min-h-[65px]" />
      {failed && (
        <Alert tone="warning">
          No se pudo cargar la verificación anti-robots. Revisa tu conexión y recarga la página.
        </Alert>
      )}
    </div>
  );
}
