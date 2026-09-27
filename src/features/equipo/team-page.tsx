"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, MoreHorizontal, UserPlus } from "lucide-react";
import type { Invitation, Member } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  Select,
  StatusBadge,
  Textarea,
  toast,
  type MenuEntry,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import {
  useBlockMember,
  useCreateInvitation,
  useEffectiveSettings,
  useInvitations,
  useMembers,
  useResendInvitation,
  useRevokeInvitation,
  useUnblockMember,
  useUpdateMemberRole,
} from "@/lib/erp/hooks";
import { can, isPlatform, roleLabel } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  INVITABLE_ROLES,
  LOCKED_TEXT,
  blockedByText,
  emptyInvite,
  invitationActions,
  invitationUrgency,
  inviteErrors,
  isInvitableRole,
  memberActions,
  openInvitations,
  sortMembers,
  teamActionError,
  teamCapacity,
  validateInvite,
  type InvitableRole,
  type InviteErrors,
  type InviteValues,
  type TeamCapacity,
} from "./team-rules";

// Equipo de la bodega (contrato de la Ola 1 §2 y §5, EQP-02…08): la dirección invita, reenvía,
// anula, cambia roles y bloquea; el resto del equipo ve nombres y roles.

type Dialog =
  | { kind: "role"; member: Member }
  | { kind: "block"; member: Member }
  | { kind: "unblock"; member: Member }
  | { kind: "revoke"; invitation: Invitation }
  | null;

const ROLE_OPTIONS = INVITABLE_ROLES.map(({ value, label }) => ({ value, label }));

// ---------------------------------------------------------------------------
// Invitar
// ---------------------------------------------------------------------------

function InviteModal({
  open,
  onOpenChange,
  organizationName,
  capacity,
  ttlHours,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  capacity: TeamCapacity;
  ttlHours: number | null;
}) {
  const create = useCreateInvitation();
  const [values, setValues] = useState<InviteValues>(emptyInvite);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const role = INVITABLE_ROLES.find((r) => r.value === values.role);

  const close = (next: boolean) => {
    if (create.isPending) return;
    if (!next) {
      setValues(emptyInvite());
      setErrors({});
      setFormError(null);
    }
    onOpenChange(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { errors: next, dto } = validateInvite(values);
    setErrors(next);
    setFormError(null);
    if (!dto) return;
    try {
      const invitation = await create.mutateAsync(dto);
      toast({
        title: `Invitación enviada a ${invitation.email}`,
        description: `Caduca el ${fmtDateTime(invitation.expiresAt)}.`,
        tone: "success",
      });
      close(false);
    } catch (err) {
      const mapped = inviteErrors(err);
      if (Object.keys(mapped.errors).length || mapped.formError) {
        setErrors(mapped.errors);
        setFormError(mapped.formError);
      } else setFormError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Invitar al equipo"
      description={`Le llegará un correo con un enlace para unirse a ${organizationName}${
        ttlHours ? `; el enlace caduca en ${ttlHours} h` : ""
      }. Nadie comparte contraseñas: cada persona crea la suya.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="invite-form" loading={create.isPending}>
            Enviar invitación
          </Button>
        </>
      }
    >
      <form id="invite-form" noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
        {capacity.full && (
          <Alert tone="warning">
            La bodega ocupa sus {capacity.limit} plazas (miembros activos e invitaciones pendientes). Anula una
            invitación o bloquea a alguien para liberar una.
          </Alert>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Correo electrónico" required error={errors.email}>
          <Input
            type="email"
            autoComplete="off"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          />
        </Field>
        <Field
          label="Rol en la bodega"
          required
          help={role?.help ?? "La dirección de la bodega no se invita: solo cambia con una transferencia."}
          error={errors.role}
        >
          <Select
            placeholder="Elige un rol"
            options={ROLE_OPTIONS}
            value={values.role}
            onValueChange={(r) => setValues((v) => ({ ...v, role: r as InvitableRole }))}
          />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cambiar rol
// ---------------------------------------------------------------------------

function RoleModal({ member, open, onClose }: { member: Member; open: boolean; onClose: () => void }) {
  const update = useUpdateMemberRole();
  const [role, setRole] = useState<string>(isInvitableRole(member.role) ? member.role : "");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isInvitableRole(role)) {
      setError("Elige el rol nuevo.");
      return;
    }
    try {
      await update.mutateAsync({ membershipId: member.membershipId, body: { role } });
      toast({ title: `${member.fullName} ahora es ${roleLabel(role)}`, tone: "success" });
      onClose();
    } catch (err) {
      setError(teamActionError(err, errorMessage));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && !update.isPending && onClose()}
      title={`Cambiar el rol de ${member.fullName}`}
      description="El rol decide qué puede registrar en el ERP. El cambio se aplica en su próxima acción."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="role-form" loading={update.isPending} disabled={role === member.role}>
            Guardar rol
          </Button>
        </>
      }
    >
      <form id="role-form" noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
        <Field
          label="Rol en la bodega"
          required
          help={INVITABLE_ROLES.find((r) => r.value === role)?.help}
          error={error ?? undefined}
        >
          <Select options={ROLE_OPTIONS} value={role} onValueChange={setRole} placeholder="Elige un rol" />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TeamPage() {
  const me = useMe();
  const platform = isPlatform(me.data);
  const owner = can(me.data, "winery.manage");
  const members = useMembers(!!me.data && !platform);
  const invitations = useInvitations(owner);
  const settings = useEffectiveSettings(owner);
  const [inviting, setInviting] = useState(false);
  // El diálogo sigue montado al cerrarse (el foco vuelve al menú que lo abrió); `open` lo muestra.
  const [dialog, setDialogState] = useState<Dialog>(null);
  const [open, setOpen] = useState(false);
  const setDialog = (next: Dialog) => {
    if (next) setDialogState(next);
    setOpen(Boolean(next));
  };
  const [blockReason, setBlockReason] = useState("");
  // Un diálogo pedido desde el menú de una fila se abre cuando el menú devuelve el foco a su botón:
  // así el diálogo lo recuerda y lo devuelve al cerrarse (y Radix no deja la página sin puntero).
  const queued = useRef<Dialog>(null);
  const fallback = useRef<number | undefined>(undefined);
  const flushQueued = () => {
    window.clearTimeout(fallback.current);
    const next = queued.current;
    queued.current = null;
    if (next) setDialog(next);
  };
  const openFromMenu = (next: Dialog) => () => {
    queued.current = next;
    window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(flushQueued, 400);
  };
  const actionsTrigger = (label: string) => (
    <IconButton label={label} variant="ghost" size="md" onFocus={() => queued.current && flushQueued()}>
      <MoreHorizontal aria-hidden size={18} />
    </IconButton>
  );
  const block = useBlockMember();
  const unblock = useUnblockMember();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const crumbs = [{ label: "Equipo" }];

  if (platform) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Equipo de la bodega</ScreenTitle>
        <EmptyState
          icon={<Building2 aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin bodega activa"
          description="El equipo es de cada bodega. Gestiona los equipos desde el Backoffice."
        />
      </div>
    );
  }

  const organizationName = activeMembership(me.data)?.organizationName ?? "la bodega";
  const userId = me.data?.user.id ?? "";
  const setting = (key: string) => settings.data?.find((s) => s.key === key)?.value;
  const capacity = teamCapacity(
    members.data ?? [],
    invitations.data ?? [],
    setting("equipo.maxColaboradoresPorBodega"),
  );
  const ttl = setting("invitacion.caducidadHoras");
  const pending = openInvitations(invitations.data ?? []);
  const now = today();

  const inviteAction = owner ? (
    <Button iconStart={<UserPlus aria-hidden size={18} />} onClick={() => setInviting(true)}>
      Invitar
    </Button>
  ) : undefined;

  const memberMenu = (m: Member) => {
    const actions = memberActions(m, { userId, isOwner: owner });
    if (actions.locked === "PLATFORM") {
      return (
        <Menu
          trigger={actionsTrigger(`Acciones para ${m.fullName}`)}
          items={[
            {
              type: "label",
              label: (
                <span className="block max-w-64 font-normal tracking-normal normal-case">{LOCKED_TEXT.PLATFORM}</span>
              ),
            },
          ]}
        />
      );
    }
    const items: MenuEntry[] = [
      ...(actions.changeRole ? [{ label: "Cambiar rol", onSelect: openFromMenu({ kind: "role", member: m }) }] : []),
      ...(actions.unblock ? [{ label: "Desbloquear", onSelect: openFromMenu({ kind: "unblock", member: m }) }] : []),
      ...(actions.block
        ? [
            { type: "separator" as const },
            {
              label: "Bloquear acceso",
              destructive: true,
              onSelect: openFromMenu({ kind: "block", member: m }),
            },
          ]
        : []),
    ];
    return items.length ? <Menu trigger={actionsTrigger(`Acciones para ${m.fullName}`)} items={items} /> : null;
  };

  const invitationMenu = (i: Invitation) => {
    const actions = invitationActions(i);
    const items: MenuEntry[] = [
      ...(actions.resend
        ? [
            {
              label: "Reenviar",
              onSelect: () =>
                resend.mutate(i.id, {
                  onSuccess: (inv) =>
                    toast({
                      title: `Invitación reenviada a ${inv.email}`,
                      description: `El enlace anterior deja de valer. Caduca el ${fmtDateTime(inv.expiresAt)}.`,
                      tone: "success",
                    }),
                  onError: (e) =>
                    toast({
                      title: "No se pudo reenviar",
                      description: teamActionError(e, errorMessage),
                      tone: "danger",
                    }),
                }),
            },
          ]
        : []),
      ...(actions.revoke
        ? [
            { type: "separator" as const },
            { label: "Anular", destructive: true, onSelect: openFromMenu({ kind: "revoke", invitation: i }) },
          ]
        : []),
    ];
    return items.length ? (
      <Menu trigger={actionsTrigger(`Acciones para la invitación a ${i.email}`)} items={items} />
    ) : null;
  };

  const activeCount = (members.data ?? []).filter((m) => m.status === "ACTIVE").length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} actions={inviteAction} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Equipo de la bodega</h1>
        <p className="text-fg-muted">
          {members.data
            ? `${activeCount} ${activeCount === 1 ? "persona activa" : "personas activas"}` +
              (owner
                ? ` · ${plural(pending.filter((i) => i.status === "PENDING").length, "invitación pendiente", "invitaciones pendientes")}`
                : "") +
              (owner && capacity.limit !== null ? ` · ${capacity.used} de ${capacity.limit} plazas ocupadas` : "")
            : "Quién trabaja en la bodega y con qué rol."}
        </p>
      </header>

      {!owner && me.data && (
        <Alert tone="info" title="Modo consulta">
          Tu rol ({roleLabel(activeMembership(me.data)?.role)}) ve los nombres y roles del equipo; solo la dirección de
          la bodega invita, cambia roles o bloquea.
        </Alert>
      )}

      <section className="grid grid-cols-1 gap-3" aria-labelledby="members-title">
        <h2 id="members-title" className="text-lg font-medium">
          Miembros
        </h2>
        <DataTable<Member>
          caption="Miembros de la bodega"
          captionHidden
          data={sortMembers(members.data ?? [])}
          loading={members.isPending && !!me.data}
          error={
            members.isError
              ? {
                  title: "No se pudo cargar el equipo",
                  description: errorMessage(members.error),
                  onRetry: () => void members.refetch(),
                }
              : undefined
          }
          getRowId={(m) => m.membershipId}
          columns={[
            {
              id: "name",
              header: "Nombre",
              cell: (m) => (
                <span className="grid">
                  <span className="font-medium">
                    {m.fullName}
                    {m.userId === userId && <span className="text-fg-muted font-normal"> (tú)</span>}
                  </span>
                  {owner && <span className="text-sm text-fg-muted">{m.email}</span>}
                </span>
              ),
            },
            { id: "role", header: "Rol", cell: (m) => roleLabel(m.role) },
            {
              id: "state",
              header: "Estado",
              cell: (m) => (
                <span className="grid justify-items-start gap-1">
                  <StatusBadge kind="member" status={m.status} />
                  {blockedByText(m) && <span className="text-xs text-fg-muted">{blockedByText(m)}</span>}
                  {m.blockedReason && <span className="text-xs text-fg-muted">Motivo: {m.blockedReason}</span>}
                  {owner && m.status === "BLOCKED" && m.blockedBy === "PLATFORM" && (
                    <span className="text-xs text-fg-muted">Solo Drinks on Chain puede desbloquearlo.</span>
                  )}
                </span>
              ),
            },
            ...(owner
              ? [
                  {
                    id: "last",
                    header: "Último acceso",
                    hideBelow: "xl" as const,
                    cell: (m: Member) => (
                      <span className="whitespace-nowrap">{m.lastLoginAt ? fmtDateTime(m.lastLoginAt) : "—"}</span>
                    ),
                  },
                ]
              : []),
            {
              id: "joined",
              header: "Desde",
              hideBelow: "lg",
              cell: (m) => <span className="whitespace-nowrap">{fmtDate(m.joinedAt)}</span>,
            },
          ]}
          rowActions={owner ? memberMenu : undefined}
          empty={
            <EmptyState
              bare
              title="Sin miembros"
              description="Invita a tu equipo para repartir el trabajo."
              action={inviteAction}
            />
          }
        />
      </section>

      {owner && (
        <Card padding="none" className="grid grid-cols-1">
          <CardHeader
            title="Invitaciones pendientes"
            description="Las caducadas se pueden reenviar con un enlace nuevo; al reenviar, el anterior deja de valer."
            divided
            className="px-5 pt-5"
          />
          <DataTable<Invitation>
            caption="Invitaciones pendientes"
            captionHidden
            bleed
            data={pending}
            loading={invitations.isPending}
            error={
              invitations.isError
                ? {
                    title: "No se pudo cargar la lista de invitaciones",
                    description: errorMessage(invitations.error),
                    onRetry: () => void invitations.refetch(),
                  }
                : undefined
            }
            getRowId={(i) => i.id}
            columns={[
              { id: "email", header: "Correo", cell: (i) => <span className="break-all">{i.email}</span> },
              { id: "role", header: "Rol", cell: (i) => roleLabel(i.role) },
              {
                id: "by",
                header: "Invitada por",
                hideBelow: "lg",
                cell: (i) => (
                  <span className="grid">
                    <span>{i.invitedBy.fullName}</span>
                    {i.invitedBy.viaPlatform && <span className="text-xs text-fg-muted">Drinks on Chain</span>}
                  </span>
                ),
              },
              {
                id: "expires",
                header: "Caduca",
                cell: (i) => {
                  const urgency = invitationUrgency(i, now);
                  return (
                    <span className="grid justify-items-start gap-1">
                      <span className="whitespace-nowrap">{fmtDateTime(i.expiresAt)}</span>
                      {urgency === "soon" && <Badge tone="warning">Vence en menos de 24 h</Badge>}
                    </span>
                  );
                },
              },
              { id: "status", header: "Estado", cell: (i) => <StatusBadge kind="invitation" status={i.status} /> },
            ]}
            rowActions={invitationMenu}
            empty={
              <EmptyState
                bare
                title="Sin invitaciones pendientes"
                description="Cuando invites a alguien, verás aquí su invitación hasta que la acepte."
                action={inviteAction}
              />
            }
          />
        </Card>
      )}

      {owner && (
        <InviteModal
          open={inviting}
          onOpenChange={setInviting}
          organizationName={organizationName}
          capacity={capacity}
          ttlHours={typeof ttl === "number" ? ttl : null}
        />
      )}

      {dialog?.kind === "role" && (
        <RoleModal
          key={dialog.member.membershipId}
          member={dialog.member}
          open={open}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "block" && (
        <ConfirmDialog
          open={open}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              setBlockReason("");
            }
          }}
          destructive
          title={`Bloquear a ${dialog.member.fullName}`}
          description="Pierde el acceso a la bodega al instante y se cierran sus sesiones en ella. Podrás desbloquearlo más tarde."
          confirmLabel="Bloquear acceso"
          onConfirm={async () => {
            try {
              await block.mutateAsync({ membershipId: dialog.member.membershipId, reason: blockReason.trim() || null });
            } catch (e) {
              throw new Error(teamActionError(e, errorMessage));
            }
            toast({ title: `${dialog.member.fullName} ya no tiene acceso`, tone: "success" });
          }}
        >
          <Field label="Motivo (opcional)" help="Hasta 500 caracteres. Queda en la bitácora de la bodega.">
            <Textarea rows={3} maxLength={500} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
          </Field>
        </ConfirmDialog>
      )}

      {dialog?.kind === "unblock" && (
        <ConfirmDialog
          open={open}
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Desbloquear a ${dialog.member.fullName}`}
          description={`Vuelve a entrar a ${organizationName} con su rol de ${roleLabel(dialog.member.role)}.`}
          confirmLabel="Desbloquear"
          onConfirm={async () => {
            try {
              await unblock.mutateAsync(dialog.member.membershipId);
            } catch (e) {
              throw new Error(teamActionError(e, errorMessage));
            }
            toast({ title: `${dialog.member.fullName} vuelve a tener acceso`, tone: "success" });
          }}
        />
      )}

      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          open={open}
          onOpenChange={(open) => !open && setDialog(null)}
          destructive
          title={`Anular la invitación a ${dialog.invitation.email}`}
          description="El enlace deja de funcionar. Puedes volver a invitar a esa persona cuando quieras."
          confirmLabel="Anular invitación"
          onConfirm={async () => {
            try {
              await revoke.mutateAsync(dialog.invitation.id);
            } catch (e) {
              throw new Error(teamActionError(e, errorMessage));
            }
            toast({ title: "Invitación anulada", tone: "success" });
          }}
        />
      )}
    </div>
  );
}
