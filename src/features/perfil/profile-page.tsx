"use client";

import { useState, type FormEvent } from "react";
import type { MeUser } from "@/lib/auth/schemas";
import {
  Alert,
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
  Switch,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { NewPasswordFields } from "@/features/acceso/new-password-fields";
import { passwordApiErrors, validateNewPassword, type NewPasswordErrors } from "@/features/acceso/password-policy";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useChangePassword, useMe, useUpdateMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ExternalLink, HashText, explorerAccountUrl } from "@/features/cuenta/stellar";
import {
  LOCALES,
  preferenceValues,
  preferencesDto,
  validateProfile,
  type PreferenceValues,
  type ProfileErrors as Errors,
  type ProfileValues as Values,
} from "./profile-model";

const WALLET_TYPE: Record<string, string> = {
  CUSTODIAL: "Custodiada por Drinks on Chain",
  SELF_CUSTODY: "Autocustodia",
};
const WALLET_PURPOSE: Record<string, string> = { PRODUCER_SIGNING: "Firma de productor", CONSUMER_NFT: "Consumidor" };

function ProfileForm({ me }: { me: MeUser }) {
  const update = useUpdateMe();
  const initial: Values = { fullName: me.fullName, phoneNumber: me.phoneNumber ?? "" };
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
      if (err instanceof ApiError && err.isValidation) {
        // 422: cada mensaje en su campo (details[].field).
        const { fieldErrors, formErrors } = fieldErrorsFrom(err, ["fullName", "phoneNumber"]);
        setErrors(Object.keys(fieldErrors).length ? fieldErrors : { fullName: formErrors[0] ?? err.message });
      } else toast({ title: "No se pudo guardar el perfil", description: errorMessage(err), tone: "danger" });
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

/** Idioma de los correos, avisos del lote y promociones (`PATCH /v1/users/me`). */
function PreferencesForm({ me }: { me: MeUser }) {
  const update = useUpdateMe();
  const initial = preferenceValues(me);
  const [values, setValues] = useState<PreferenceValues>(initial);
  const dto = preferencesDto(initial, values);
  const dirty = Object.keys(dto).length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    try {
      await update.mutateAsync(dto);
      toast({ title: "Preferencias guardadas", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudieron guardar las preferencias", description: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader title="Preferencias" description="Cómo y de qué te escribe Drinks on Chain." />
      <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
        <Field label="Idioma de los correos" help="El ERP está en español; el idioma se usa en los correos.">
          <Select
            options={LOCALES}
            value={values.preferredLocale}
            onValueChange={(preferredLocale) => setValues((v) => ({ ...v, preferredLocale }))}
          />
        </Field>
        <Switch
          label="Avisos del lote"
          description="Correos cuando un lote avanza: dictamen, fin del reposo, embotellado."
          checked={values.lotProgress}
          onCheckedChange={(lotProgress) => setValues((v) => ({ ...v, lotProgress }))}
        />
        <Switch
          label="Promociones y novedades"
          description="Campañas y novedades de Drinks on Chain. Puedes dejar de recibirlas cuando quieras."
          checked={values.promotionsConsent}
          onCheckedChange={(promotionsConsent) => setValues((v) => ({ ...v, promotionsConsent }))}
        />
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
            Guardar preferencias
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** `POST /v1/users/me/password`: el backend cierra las demás sesiones; esta sigue abierta. */
function PasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<NewPasswordErrors & { current?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = { ...validateNewPassword(password, confirm) };
    if (!current) next.current = "Escribe tu contraseña actual.";
    else if (!next.password && password === current)
      next.password = "La contraseña nueva debe ser distinta de la actual.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: password });
      toast({
        title: "Contraseña cambiada",
        description: "Cerramos tus sesiones en otros dispositivos; esta sigue abierta.",
        tone: "success",
      });
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      const mapped = passwordApiErrors(err, ["currentPassword", "newPassword"] as const);
      setErrors({ current: mapped.errors.currentPassword, password: mapped.errors.newPassword });
      setFormError(mapped.formError ?? (Object.keys(mapped.errors).length ? null : errorMessage(err)));
    }
  };

  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader title="Contraseña" description="Al cambiarla se cierran tus sesiones en otros dispositivos." />
      <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Contraseña actual" required error={errors.current}>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          errors={errors}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending}>
            Cambiar contraseña
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
        <ScreenTitle>Mi perfil</ScreenTitle>
        <ErrorState description={errorMessage(me.error)} onRetry={() => me.refetch()} retrying={me.isFetching} />
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle busy>Mi perfil</ScreenTitle>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  const u = me.data.user;
  const wallet = u.primaryWallet;
  const active = activeMembership(me.data);
  const license = (organizationId: string) =>
    u.wineryMemberships.find((m) => m.wineryId === organizationId)?.professionalLicenseNumber;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">{u.fullName}</h1>
        <p className="text-fg-muted">{active ? `${roleLabel(active.role)} · ${active.organizationName}` : "—"}</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-6">
          <ProfileForm key={u.id + u.fullName + (u.phoneNumber ?? "")} me={u} />
          <PreferencesForm
            key={[u.id, u.preferredLocale, u.notificationPrefs?.lotProgress, u.promotionsConsent].join("|")}
            me={u}
          />
          <PasswordForm />
        </div>
        <div className="grid grid-cols-1 gap-6">
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Cuenta" />
            <KeyValueList
              items={[
                { term: "Rol en la organización activa", value: roleLabel(active?.role) },
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
            <CardHeader
              title="Organizaciones"
              description="Las organizaciones en las que trabajas y tu rol en cada una. Cambia de organización desde la cabecera."
            />
            {me.data.memberships.length === 0 ? (
              <p className="text-fg-muted text-sm">No perteneces a ninguna organización.</p>
            ) : (
              <ul className="divide-border grid divide-y">
                {me.data.memberships.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{m.organizationName}</span>
                      <span className="text-fg-muted text-sm">
                        {" "}
                        · {roleLabel(m.role)}
                        {license(m.organizationId) ? ` · Matrícula ${license(m.organizationId)}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {m.organizationId === me.data.activeOrganizationId && <Badge tone="accent">Activa ahora</Badge>}
                      <Badge tone={m.status === "ACTIVE" ? "success" : "neutral"}>
                        {m.status === "ACTIVE" ? "Activa" : "Bloqueada"}
                      </Badge>
                    </span>
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
