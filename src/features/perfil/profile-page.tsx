"use client";

import { useState } from "react";
import type { UserProfileResponse } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Select,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe, useUpdateMe } from "@/lib/auth/hooks";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ExternalLink, HashText, explorerAccountUrl } from "@/features/cuenta/stellar";
import { validateProfile, type ProfileErrors as Errors, type ProfileValues as Values } from "./profile-model";

const LOCALES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

const WALLET_TYPE: Record<string, string> = {
  CUSTODIAL: "Custodiada por Drinks on Chain",
  SELF_CUSTODY: "Autocustodia",
};
const WALLET_PURPOSE: Record<string, string> = { PRODUCER_SIGNING: "Firma de productor", CONSUMER_NFT: "Consumidor" };

function ProfileForm({ me }: { me: UserProfileResponse }) {
  const update = useUpdateMe();
  const initial: Values = {
    fullName: me.fullName,
    phoneNumber: me.phoneNumber ?? "",
    preferredLocale: me.preferredLocale || "es",
  };
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: next, dto } = validateProfile(values);
    setErrors(next);
    if (!dto) return;
    try {
      await update.mutateAsync(dto);
      toast({ title: "Perfil actualizado", tone: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) setErrors({ fullName: err.message });
      else toast({ title: "No se pudo guardar el perfil", description: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader title="Datos personales" description="Así te ven tus compañeros en la bodega." />
      <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
        <Field label="Nombre completo" required error={errors.fullName}>
          <Input value={values.fullName} onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))} />
        </Field>
        <Field label="Correo electrónico" help="Es tu usuario de acceso; no se puede cambiar desde aquí.">
          <Input value={me.email} readOnly disabled />
        </Field>
        <Field label="Teléfono" error={errors.phoneNumber}>
          <Input
            type="tel"
            value={values.phoneNumber}
            onChange={(e) => setValues((v) => ({ ...v, phoneNumber: e.target.value }))}
          />
        </Field>
        <Field label="Idioma" help="El ERP está en español; el idioma se usa en los correos.">
          <Select
            options={LOCALES}
            value={values.preferredLocale}
            onValueChange={(preferredLocale) => setValues((v) => ({ ...v, preferredLocale }))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || update.isPending}
            onClick={() => setValues(initial)}
          >
            Descartar
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!dirty}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ProfilePage() {
  const me = useMe();
  const crumbs = [{ label: "Perfil" }];
  if (me.isError) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ErrorState description={errorMessage(me.error)} onRetry={() => me.refetch()} retrying={me.isFetching} />
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        <PageChrome breadcrumbs={crumbs} />
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  const u = me.data;
  const wallet = u.primaryWallet;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">{u.fullName}</h1>
        <p className="text-fg-muted">{roleLabel(u.userRole)}</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ProfileForm key={u.id + u.fullName + (u.phoneNumber ?? "") + u.preferredLocale} me={u} />
        <div className="grid grid-cols-1 gap-6">
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Cuenta" />
            <KeyValueList
              items={[
                { term: "Rol", value: roleLabel(u.userRole) },
                {
                  term: "Estado",
                  value: u.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="danger">Inactiva</Badge>,
                },
                { term: "Alta", value: fmtDate(u.createdAt) },
                { term: "Último acceso", value: u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—" },
              ]}
            />
          </Card>
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Bodegas" description="Las bodegas en las que trabajas y tu rol en cada una." />
            {u.wineryMemberships.length === 0 ? (
              <p className="text-fg-muted text-sm">No perteneces a ninguna bodega.</p>
            ) : (
              <ul className="divide-border grid divide-y">
                {u.wineryMemberships.map((m) => (
                  <li key={m.wineryId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{m.wineryName}</span>
                      <span className="text-fg-muted text-sm">
                        {" "}
                        · {roleLabel(m.memberRole)}
                        {m.professionalLicenseNumber ? ` · Matrícula ${m.professionalLicenseNumber}` : ""}
                      </span>
                    </span>
                    <Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Activa" : "Inactiva"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader
              title="Billetera"
              description="La crea Drinks on Chain al registrarte. No tienes que guardar ninguna clave."
            />
            {wallet ? (
              <KeyValueList
                layout="stacked"
                items={[
                  {
                    term: "Dirección en Stellar (testnet)",
                    value: (
                      <span className="flex flex-wrap items-center gap-x-3">
                        <HashText value={wallet.stellarPublicAddress} label="Copiar dirección" />
                        <ExternalLink href={explorerAccountUrl(wallet.stellarPublicAddress)}>
                          Ver en stellar.expert
                        </ExternalLink>
                      </span>
                    ),
                  },
                  {
                    term: "Tipo",
                    value: `${WALLET_TYPE[wallet.walletType] ?? wallet.walletType} · ${WALLET_PURPOSE[wallet.walletPurpose] ?? wallet.walletPurpose}`,
                  },
                ]}
              />
            ) : (
              <p className="text-fg-muted text-sm">Aún no tienes billetera asignada.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
