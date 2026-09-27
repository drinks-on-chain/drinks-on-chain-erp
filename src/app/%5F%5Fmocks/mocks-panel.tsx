"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  SCENARIOS,
  expireAccessTokens,
  getScenario,
  mockMailbox,
  resetErpDb,
  setScenario,
  type ScenarioName,
} from "@drinks-on-chain/mocks/browser";
import type { MockEmail } from "@drinks-on-chain/mocks";
import { DEMO_PASSWORD, demoUsers } from "@drinks-on-chain/mocks/fixtures";
import { Alert, Badge, Button, Card, CardHeader, DataTable, Field, Select, toast } from "@drinks-on-chain/ui";
import { env } from "@/lib/env";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { MFA_NOT_SUPPORTED } from "@/lib/auth/api";
import { fmtDateTime } from "@/lib/format";
import { useLogin } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

const SCENARIO_LABELS: Record<ScenarioName, string> = {
  normal: "Normal",
  empty: "Listas vacías",
  error: "Error del servidor (500)",
  slow: "Lento (+2,5 s)",
  offline: "Sin conexión",
};

/** Enlace del correo: dentro de la app si es de este origen; si no, a la otra app. */
function MailLink({ email }: { email: MockEmail }) {
  if (!email.link) return <span className="text-fg-subtle">—</span>;
  const url = new URL(email.link);
  if (typeof window !== "undefined" && url.origin === window.location.origin) {
    return (
      <Link href={`${url.pathname}${url.search}`} className="text-accent-text hover:underline">
        Abrir enlace
      </Link>
    );
  }
  return (
    <a href={email.link} className="text-accent-text hover:underline">
      Abrir en {email.app ?? "otra app"}
    </a>
  );
}

/** Buzón simulado de los mocks (como Mailpit): invitaciones, recuperación, avisos. */
function Mailbox() {
  const [emails, setEmails] = useState<MockEmail[]>(() => mockMailbox.list().slice(0, 15));
  return (
    <Card className="grid gap-4 p-6">
      <CardHeader
        title="Buzón simulado"
        description="Los correos que enviaría el backend. Los enlaces llevan a la pantalla correspondiente."
        action={
          <Button size="sm" variant="secondary" onClick={() => setEmails(mockMailbox.list().slice(0, 15))}>
            Actualizar
          </Button>
        }
      />
      <DataTable<MockEmail>
        caption="Últimos correos"
        density="compact"
        getRowId={(m) => m.id}
        data={emails}
        columns={[
          {
            id: "date",
            header: "Fecha",
            cell: (m) => <span className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</span>,
          },
          { id: "to", header: "Para", cell: (m) => <span className="break-all">{m.to}</span> },
          { id: "subject", header: "Asunto", cell: (m) => m.subject },
          { id: "link", header: "Enlace", cell: (m) => <MailLink email={m} /> },
        ]}
      />
    </Card>
  );
}

export function MocksPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [scenario, setScenarioState] = useState<ScenarioName>(() => getScenario());

  function changeScenario(value: string) {
    const next = value as ScenarioName;
    setScenario(next);
    setScenarioState(next);
    queryClient.invalidateQueries();
  }

  function enterAs(email: string) {
    login.mutate(
      { email, password: DEMO_PASSWORD },
      {
        onSuccess: () => router.push("/"),
        onError: (e) =>
          toast({
            title: e instanceof ApiError && e.code === MFA_NOT_SUPPORTED ? e.message : errorMessage(e),
            tone: "danger",
          }),
      },
    );
  }

  return (
    <main className="mx-auto grid max-w-(--doc-content-max) gap-6 p-6">
      <header className="grid grid-cols-1 gap-1">
        <p className="text-2xs tracking-label text-fg-subtle uppercase">Solo desarrollo</p>
        <h1 className="font-display text-3xl">{es.mocks.title}</h1>
      </header>

      {!env.mocks && (
        <Alert tone="warning">
          MSW está apagado. Arranca con <code>NEXT_PUBLIC_MOCKS=1</code> (<code>pnpm dev:mocks</code>) para usar este
          panel.
        </Alert>
      )}

      <Card className="grid gap-4 p-6">
        <CardHeader title={es.mocks.scenario} />
        <div className="flex flex-wrap items-end gap-4">
          <Field label={es.mocks.scenario} hideLabel className="w-72">
            <Select
              value={scenario}
              onValueChange={changeScenario}
              options={SCENARIOS.map((s) => ({ value: s, label: SCENARIO_LABELS[s] }))}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              resetErpDb();
              queryClient.invalidateQueries();
              toast({ title: es.mocks.resetDone, tone: "success" });
            }}
          >
            {es.mocks.reset}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              expireAccessTokens();
              toast({ title: es.mocks.expireDone, tone: "info" });
            }}
          >
            {es.mocks.expire}
          </Button>
        </div>
      </Card>

      <Card className="grid gap-4 p-6">
        <CardHeader title={es.mocks.users} description={`Contraseña de todos: ${DEMO_PASSWORD}`} />
        <DataTable
          caption="Usuarios de demo"
          density="compact"
          getRowId={(u) => u.key}
          data={demoUsers}
          columns={[
            { id: "name", header: "Nombre", cell: (u) => u.fullName },
            { id: "email", header: "Correo", cell: (u) => u.email },
            { id: "role", header: "Rol", cell: (u) => <Badge>{u.memberRole ?? u.userRole}</Badge> },
            { id: "winery", header: "Bodega activa", cell: (u) => u.wineryName ?? "—" },
            {
              id: "memberships",
              header: "Membresías",
              align: "right",
              cell: (u) => u.memberships.length,
            },
            {
              id: "enter",
              header: "",
              align: "right",
              cell: (u) => (
                <Button size="sm" variant="secondary" onClick={() => enterAs(u.email)} disabled={login.isPending}>
                  Entrar
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {env.mocks && <Mailbox />}
    </main>
  );
}
