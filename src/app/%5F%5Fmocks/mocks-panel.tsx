"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SCENARIOS, getScenario, resetErpDb, setScenario, type ScenarioName } from "@drinks-on-chain/mocks/browser";
import { DEMO_PASSWORD, demoUsers } from "@drinks-on-chain/mocks/fixtures";
import { Alert, Badge, Button, Card, CardHeader, DataTable, Field, Select, toast } from "@drinks-on-chain/ui";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/api/errors";
import { useLogin } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

const SCENARIO_LABELS: Record<ScenarioName, string> = {
  normal: "Normal",
  empty: "Listas vacías",
  error: "Error del servidor (500)",
  slow: "Lento (+2,5 s)",
  offline: "Sin conexión",
};

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
        onError: (e) => toast({ title: errorMessage(e), tone: "danger" }),
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
            { id: "winery", header: "Bodega", cell: (u) => u.wineryName ?? "—" },
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
    </main>
  );
}
