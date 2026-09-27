"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2 } from "lucide-react";
import type { EffectiveSetting, WineryResponse } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Skeleton,
  TextLink,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { useEffectiveSettings, useUpdateWinery, useWinery } from "@/lib/erp/hooks";
import { BEVERAGE_CATEGORY, CERTIFICATION_STATUS } from "@/lib/erp/labels";
import { can, isPlatform, roleLabel } from "@/lib/erp/permissions";
import { fmtDate } from "@/lib/format";
import { APPLIES_AT, formatSettingValue, settingGroup, sortSettings } from "./effective-settings";
import { validateWinery, wineryValues, type WineryErrors, type WineryValues } from "./settings-model";

/** Campos que el backend puede marcar en un 422 (details[].field). */
const WINERY_FIELDS = ["commercialName", "address", "contactEmail", "contactPhone"] as const;

function WineryCard({ winery, editable }: { winery: WineryResponse; editable: boolean }) {
  const update = useUpdateWinery();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<WineryValues>(() => wineryValues(winery));
  const [errors, setErrors] = useState<WineryErrors>({});
  const cert = CERTIFICATION_STATUS[winery.certificationStatus];
  const field = (k: keyof WineryValues) => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: next, dto } = validateWinery(values);
    setErrors(next);
    if (!dto) return;
    try {
      await update.mutateAsync(dto);
      toast({ title: "Datos de la bodega guardados", tone: "success" });
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) {
        // 422: cada mensaje en su campo (details[].field); si ninguno es de este formulario, en el nombre.
        const { fieldErrors, formErrors } = fieldErrorsFrom(err, WINERY_FIELDS);
        setErrors(Object.keys(fieldErrors).length ? fieldErrors : { commercialName: formErrors[0] ?? err.message });
      } else toast({ title: "No se pudieron guardar los datos", description: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader
        title="Datos de la bodega"
        description={editable ? undefined : "Solo la administración de la bodega puede editarlos."}
        action={
          editable && !editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setValues(wineryValues(winery));
                setErrors({});
                setEditing(true);
              }}
            >
              Editar datos
            </Button>
          ) : (
            <Badge tone={cert.tone}>{cert.label}</Badge>
          )
        }
      />
      {editing ? (
        <form noValidate onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre comercial" required error={errors.commercialName}>
            <Input {...field("commercialName")} />
          </Field>
          <Field label="Correo de contacto" required error={errors.contactEmail}>
            <Input type="email" {...field("contactEmail")} />
          </Field>
          <Field label="Teléfono de contacto" error={errors.contactPhone}>
            <Input type="tel" {...field("contactPhone")} />
          </Field>
          <Field label="Dirección" error={errors.address}>
            <Input {...field("address")} />
          </Field>
          <p className="text-fg-muted text-sm md:col-span-2">
            La razón social, el NIT y el registro SENASAG los cambia Drinks on Chain tras verificar la documentación.
          </p>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={update.isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={update.isPending}>
              Guardar cambios
            </Button>
          </div>
        </form>
      ) : (
        <KeyValueList
          items={[
            { term: "Nombre comercial", value: winery.commercialName },
            { term: "Razón social", value: winery.legalName },
            { term: "NIT", value: winery.taxIdNit },
            { term: "Categoría", value: BEVERAGE_CATEGORY[winery.beverageCategory] },
            { term: "Región", value: `${winery.geographicRegion} · ${winery.countryCode}` },
            { term: "Registro SENASAG", value: winery.senasagSanitaryReg ?? "—" },
            { term: "Dirección", value: winery.address ?? "—" },
            { term: "Correo de contacto", value: winery.contactEmail },
            { term: "Teléfono", value: winery.contactPhone ?? "—" },
            { term: "Exportadora certificada", value: winery.isExportCertified ? "Sí" : "No" },
            { term: "Certificación", value: <Badge tone={cert.tone}>{cert.label}</Badge> },
            ...(winery.approvedAt ? [{ term: "Aprobada", value: fmtDate(winery.approvedAt) }] : []),
          ]}
        />
      )}
    </Card>
  );
}

/** Parámetros que aplican a la bodega (contrato de la Ola 1 §6): solo lectura. */
function EffectiveSettingsCard() {
  const settings = useEffectiveSettings();
  return (
    <Card padding="none" className="grid grid-cols-1">
      <CardHeader
        title="Configuración efectiva"
        description="Valores que aplican a tu bodega. Los fija Drinks on Chain: «Estándar» es el general de la plataforma; «Propio» es un ajuste solo para tu bodega."
        divided
        className="px-5 pt-5"
      />
      <DataTable<EffectiveSetting>
        caption="Configuración efectiva de la bodega"
        captionHidden
        bleed
        data={settings.data ? sortSettings(settings.data) : []}
        loading={settings.isPending}
        error={
          settings.isError
            ? {
                title: "No se pudo cargar la configuración",
                description: errorMessage(settings.error),
                onRetry: () => void settings.refetch(),
              }
            : undefined
        }
        getRowId={(s) => s.key}
        columns={[
          {
            id: "setting",
            header: "Parámetro",
            cell: (s) => (
              <span className="grid">
                <span>{s.description}</span>
                <span className="font-mono text-xs break-all text-fg-subtle">{s.key}</span>
              </span>
            ),
          },
          { id: "area", header: "Área", hideBelow: "md", cell: (s) => settingGroup(s.key) },
          {
            id: "value",
            header: "Valor",
            cell: (s) => <span className="tabular-nums">{formatSettingValue(s.key, s.value)}</span>,
          },
          {
            id: "source",
            header: "Origen",
            cell: (s) =>
              s.source === "WINERY" ? <Badge tone="accent">Propio</Badge> : <Badge tone="neutral">Estándar</Badge>,
          },
          { id: "applies", header: "Se aplica", hideBelow: "lg", cell: (s) => APPLIES_AT[s.appliesAt] },
        ]}
        empty={<EmptyState bare title="Sin parámetros" description="La plataforma aún no publica parámetros." />}
      />
    </Card>
  );
}

export function SettingsPage() {
  const me = useMe();
  const platform = isPlatform(me.data);
  const winery = useWinery(!!me.data && !platform);
  const manage = can(me.data, "winery.manage");
  const crumbs = [{ label: "Ajustes" }];

  if (platform) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Ajustes de la bodega</ScreenTitle>
        <EmptyState
          icon={<Building2 aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin bodega activa"
          description="Los ajustes son de cada bodega. Gestiona las bodegas desde el Backoffice."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Ajustes de la bodega</h1>
        <p className="text-fg-muted">
          Datos de la bodega y parámetros que le aplican. El equipo se gestiona en{" "}
          <TextLink asChild variant="inline">
            <Link href="/equipo">Equipo</Link>
          </TextLink>
          {manage && (
            <>
              {" "}
              y lo ocurrido queda en la{" "}
              <TextLink asChild variant="inline">
                <Link href="/ajustes/bitacora">bitácora</Link>
              </TextLink>
            </>
          )}
          .
        </p>
      </header>

      {!manage && me.data && (
        <Alert tone="info" title="Modo consulta">
          Tu rol ({roleLabel(activeMembership(me.data)?.role)}) puede ver los ajustes; los cambia la administración de
          la bodega.
        </Alert>
      )}

      <div className="grid max-w-3xl grid-cols-1">
        {winery.isError ? (
          <ErrorState
            description={errorMessage(winery.error)}
            onRetry={() => winery.refetch()}
            retrying={winery.isFetching}
          />
        ) : winery.data ? (
          <WineryCard key={winery.data.id} winery={winery.data} editable={manage} />
        ) : (
          <Skeleton className="h-96" />
        )}
      </div>
      <EffectiveSettingsCard />
    </div>
  );
}
