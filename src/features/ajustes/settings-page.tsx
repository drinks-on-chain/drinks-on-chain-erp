"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, UserPlus } from "lucide-react";
import type { WineryMemberItem, WineryResponse } from "@drinks-on-chain/mocks";
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
  Modal,
  Select,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateMember, useMembers, useUpdateWinery, useWinery } from "@/lib/erp/hooks";
import { BEVERAGE_CATEGORY, CERTIFICATION_STATUS } from "@/lib/erp/labels";
import { can, roleLabel } from "@/lib/erp/permissions";
import { fmtDate } from "@/lib/format";
import {
  MEMBER_ROLE_OPTIONS,
  MIN_PASSWORD,
  emptyMember,
  validateMember,
  validateWinery,
  wineryValues,
  type MemberErrors,
  type MemberValues,
  type WineryErrors,
  type WineryValues,
} from "./settings-model";

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
      if (err instanceof ApiError && err.isValidation) setErrors({ commercialName: err.message });
      else toast({ title: "No se pudieron guardar los datos", description: errorMessage(err), tone: "danger" });
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

function AddMemberModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateMember();
  const [values, setValues] = useState<MemberValues>(emptyMember);
  const [errors, setErrors] = useState<MemberErrors>({});
  const field = (k: Exclude<keyof MemberValues, "memberRole">) => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });
  const role = MEMBER_ROLE_OPTIONS.find((r) => r.value === values.memberRole);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: next, dto } = validateMember(values);
    setErrors(next);
    if (!dto) return;
    try {
      const m = await create.mutateAsync(dto);
      toast({ title: `${m.fullName} ya es parte de la bodega`, tone: "success" });
      setValues(emptyMember());
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else if (err instanceof ApiError && err.isValidation) setErrors({ email: err.message });
      else toast({ title: "No se pudo añadir el miembro", description: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title="Añadir miembro"
      description="Crea la cuenta de una persona del equipo y la une a la bodega. Comparte con ella la contraseña inicial."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" loading={create.isPending}>
            Añadir miembro
          </Button>
        </>
      }
    >
      <form id="member-form" noValidate onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre completo" required error={errors.fullName} className="md:col-span-2">
          <Input autoComplete="off" {...field("fullName")} />
        </Field>
        <Field label="Correo electrónico" required error={errors.email}>
          <Input type="email" autoComplete="off" {...field("email")} />
        </Field>
        <Field
          label="Contraseña inicial"
          required
          help={`Al menos ${MIN_PASSWORD} caracteres.`}
          error={errors.password}
        >
          <Input type="password" autoComplete="new-password" {...field("password")} />
        </Field>
        <Field label="Rol en la bodega" required help={role?.help} error={errors.memberRole}>
          {/* El desplegable del Select usa z-dropdown (20), bajo el velo del Modal (30): se sube
              por encima del Modal (40) hasta que el sistema de diseño lo corrija. */}
          <Select
            placeholder="Elige un rol"
            contentClassName="z-[45]!"
            options={MEMBER_ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            value={values.memberRole}
            onValueChange={(memberRole) =>
              setValues((v) => ({ ...v, memberRole: memberRole as MemberValues["memberRole"] }))
            }
          />
        </Field>
        <Field label="Teléfono" error={errors.phoneNumber}>
          <Input type="tel" {...field("phoneNumber")} />
        </Field>
        <Field
          label="Matrícula profesional"
          help="Colegio de enólogos o agrónomos, si aplica."
          className="md:col-span-2"
        >
          <Input {...field("professionalLicenseNumber")} />
        </Field>
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const me = useMe();
  const platform = me.data?.userRole === "PLATFORM_ADMIN";
  const winery = useWinery(!!me.data && !platform);
  const members = useMembers();
  const manage = can(me.data, "winery.manage");
  const [adding, setAdding] = useState(false);
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

  const addAction = manage ? (
    <Button iconStart={<UserPlus aria-hidden size={18} />} onClick={() => setAdding(true)}>
      Añadir miembro
    </Button>
  ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} actions={addAction} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Ajustes de la bodega</h1>
        <p className="text-fg-muted">
          Datos de la bodega y su equipo.{" "}
          <Link href="/cuenta" className="text-accent-text hover:underline">
            Ver la cuenta Stellar
          </Link>
        </p>
      </header>

      {!manage && me.data && (
        <Alert tone="info" title="Modo consulta">
          Tu rol ({roleLabel(me.data.userRole)}) puede ver los ajustes; los cambia la administración de la bodega.
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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

        <section className="grid grid-cols-1 gap-3" aria-labelledby="members-title">
          <h2 id="members-title" className="text-lg font-medium">
            Miembros
          </h2>
          {members.isError ? (
            <ErrorState
              bare
              description={errorMessage(members.error)}
              onRetry={() => members.refetch()}
              retrying={members.isFetching}
            />
          ) : (
            <DataTable<WineryMemberItem>
              caption="Miembros de la bodega"
              captionHidden
              data={members.data ?? []}
              loading={members.isPending}
              getRowId={(m) => m.id}
              defaultSort={{ columnId: "name", direction: "asc" }}
              columns={[
                {
                  id: "name",
                  header: "Nombre",
                  accessor: "fullName",
                  sortable: true,
                  cell: (m) => (
                    <span className="grid">
                      <span className="font-medium">{m.fullName}</span>
                      <span className="text-fg-muted text-sm">{m.email}</span>
                    </span>
                  ),
                },
                {
                  id: "role",
                  header: "Rol",
                  accessor: (m) => roleLabel(m.memberRole),
                  sortable: true,
                  cell: (m) => roleLabel(m.memberRole),
                },
                {
                  id: "license",
                  header: "Matrícula",
                  hideBelow: "lg",
                  cell: (m) => m.professionalLicenseNumber ?? <span className="text-fg-subtle">—</span>,
                },
                {
                  id: "joined",
                  header: "Desde",
                  accessor: "joinedAt",
                  sortable: true,
                  hideBelow: "md",
                  cell: (m) => <span className="whitespace-nowrap">{fmtDate(m.joinedAt)}</span>,
                },
                {
                  id: "state",
                  header: "Estado",
                  cell: (m) =>
                    m.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>,
                },
              ]}
              empty={
                <EmptyState
                  bare
                  title="Sin miembros"
                  description="Añade a tu equipo para repartir el trabajo."
                  action={addAction}
                />
              }
            />
          )}
        </section>
      </div>

      {manage && <AddMemberModal open={adding} onOpenChange={setAdding} />}
    </div>
  );
}
