"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InvitationPreview } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Skeleton,
  Spinner,
  StatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { MFA_NOT_SUPPORTED } from "@/lib/auth/api";
import { useAcceptInvitation, useInvitation, useIsAuthenticated, useLogout, useMe } from "@/lib/auth/hooks";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { NewPasswordFields } from "./new-password-fields";
import { passwordApiErrors, validateNewPassword, type NewPasswordErrors } from "./password-policy";

// Aceptar una invitación (contrato de la Ola 1 §2, IAM-10): cuenta nueva (nombre y contraseña) o
// cuenta existente (iniciar sesión con el mismo correo y aceptar). Al aceptar, se entra al ERP con
// la bodega de la invitación como organización activa.

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Mensaje de un error al aceptar o al iniciar sesión para aceptar. */
function acceptErrorMessage(error: unknown, invitation: InvitationPreview): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INVITATION_EXPIRED":
        return `La invitación caducó. Pide a ${invitation.invitedByName} que te la reenvíe.`;
      case "INVITATION_EMAIL_MISMATCH":
        return `La invitación es para ${invitation.email}: entra con ese correo para aceptarla.`;
      case "INVITATION_NOT_PENDING":
        return "La invitación ya no está pendiente: se aceptó o se anuló.";
      case "INVITATION_NOT_FOUND":
        return "La invitación ya no existe o el enlace dejó de valer.";
      case MFA_NOT_SUPPORTED:
        return error.message;
    }
    if (error.isUnauthorized) return "La contraseña no es correcta.";
  }
  return errorMessage(error);
}

function Summary({ invitation }: { invitation: InvitationPreview }) {
  return (
    <Card variant="sunken" className="grid grid-cols-1 gap-3">
      <p className="m-0">
        <span className="font-medium">{invitation.invitedByName}</span> te invita a unirte a{" "}
        <span className="font-medium">{invitation.organizationName}</span> en Drinks on Chain.
      </p>
      <KeyValueList
        items={[
          { term: "Bodega", value: invitation.organizationName },
          { term: "Rol", value: roleLabel(invitation.role) },
          { term: "Correo", value: <span className="break-all">{invitation.email}</span> },
          { term: "Caduca", value: fmtDateTime(invitation.expiresAt) },
          { term: "Estado", value: <StatusBadge kind="invitation" status={invitation.status} /> },
        ]}
      />
    </Card>
  );
}

function NewAccountForm({
  invitation,
  submit,
  pending,
  error,
}: {
  invitation: InvitationPreview;
  submit: (fullName: string, password: string) => void;
  pending: boolean;
  error: unknown;
}) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [local, setLocal] = useState<NewPasswordErrors & { fullName?: string }>({});
  const server = passwordApiErrors(error, ["password", "fullName"] as const);
  const errors = { ...local, ...server.errors };
  const message =
    error && !Object.keys(server.errors).length ? acceptErrorMessage(error, invitation) : server.formError;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof local = { ...validateNewPassword(password, confirm) };
    if (!fullName.trim()) next.fullName = "Escribe tu nombre completo.";
    setLocal(next);
    if (Object.keys(next).length) return;
    submit(fullName.trim(), password);
  };

  return (
    <form noValidate onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
      <h2 className="m-0 text-lg font-medium">Crea tu cuenta</h2>
      {message && <Alert tone="danger">{message}</Alert>}
      <Field label="Correo electrónico" help="Es el correo de la invitación y será tu usuario.">
        <Input type="email" value={invitation.email} readOnly autoComplete="username" />
      </Field>
      <Field label="Nombre completo" required error={errors.fullName}>
        <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPasswordChange={setPassword}
        onConfirmChange={setConfirm}
        errors={errors}
        passwordLabel="Contraseña"
      />
      <Button type="submit" size="lg" loading={pending}>
        Crear cuenta y entrar
      </Button>
    </form>
  );
}

function ExistingAccountForm({
  invitation,
  submit,
  pending,
  error,
}: {
  invitation: InvitationPreview;
  submit: (password: string) => void;
  pending: boolean;
  error: unknown;
}) {
  const [password, setPassword] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const message = error ? acceptErrorMessage(error, invitation) : null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setLocal("Escribe tu contraseña.");
      return;
    }
    setLocal(null);
    submit(password);
  };

  return (
    <form noValidate onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
      <h2 className="m-0 text-lg font-medium">Entra para aceptar</h2>
      <p className="m-0 text-sm text-fg-muted">
        Ya tienes una cuenta con este correo. Inicia sesión y la bodega se añadirá a tus organizaciones.
      </p>
      {message && <Alert tone="danger">{message}</Alert>}
      <Field label="Correo electrónico">
        <Input type="email" value={invitation.email} readOnly autoComplete="username" />
      </Field>
      <Field label="Contraseña" required error={local ?? undefined}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Entrar y aceptar
      </Button>
      <p className="m-0 text-center text-sm">
        <Link href="/recuperar" className="text-accent-text hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}

/** Invitación que ya no se puede aceptar (caducada, aceptada o anulada). */
function Closed({ invitation }: { invitation: InvitationPreview }) {
  const text: Record<string, { title: string; body: string }> = {
    EXPIRED: {
      title: "La invitación caducó",
      body: `Venció el ${fmtDateTime(invitation.expiresAt)}. Pide a ${invitation.invitedByName} que te la reenvíe: te llegará un enlace nuevo.`,
    },
    ACCEPTED: { title: "Esta invitación ya se aceptó", body: "Entra con tu cuenta para trabajar en la bodega." },
    REVOKED: {
      title: "Esta invitación se anuló",
      body: `${invitation.invitedByName} la anuló. Si crees que es un error, pídele una invitación nueva.`,
    },
  };
  const t = text[invitation.status] ?? text.REVOKED!;
  return (
    <>
      <Alert tone={invitation.status === "ACCEPTED" ? "info" : "warning"} title={t.title}>
        {t.body}
      </Alert>
      <Button asChild variant="secondary" size="lg">
        <Link href="/login">Ir a iniciar sesión</Link>
      </Button>
    </>
  );
}

export function InvitationAccept({ token }: { token: string }) {
  const router = useRouter();
  const invitation = useInvitation(token);
  const authenticated = useIsAuthenticated();
  const me = useMe(authenticated === true);
  const accept = useAcceptInvitation(token);
  const logout = useLogout();
  const [signingOut, setSigningOut] = useState(false);

  const frame = (children: ReactNode) => <div className="grid grid-cols-1 gap-5">{children}</div>;

  if (invitation.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4" aria-busy="true">
        <Skeleton className="h-40" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (invitation.isError) {
    const notFound = invitation.error instanceof ApiError && invitation.error.isNotFound;
    return frame(
      notFound ? (
        <>
          <Alert tone="warning" title="La invitación no existe">
            El enlace no es válido o dejó de valer: si te reenviaron la invitación, usa el enlace del correo más
            reciente.
          </Alert>
          <Button asChild variant="secondary" size="lg">
            <Link href="/login">Ir a iniciar sesión</Link>
          </Button>
        </>
      ) : (
        <ErrorState
          description={errorMessage(invitation.error)}
          onRetry={() => invitation.refetch()}
          retrying={invitation.isFetching}
        />
      ),
    );
  }

  const inv = invitation.data;
  const org = inv.organizationName;

  if (accept.isSuccess) {
    return (
      <div className="grid place-items-center py-8" aria-busy="true">
        <Spinner label={`Entrando en ${org}…`} />
      </div>
    );
  }

  const done = () => {
    toast({ title: `Te damos la bienvenida a ${org}`, tone: "success" });
    router.replace("/");
  };
  const onError = (err: unknown) => {
    // Caducó o dejó de estar pendiente mientras tanto: se vuelve a leer para mostrar el estado.
    if (err instanceof ApiError && ["INVITATION_EXPIRED", "INVITATION_NOT_PENDING"].includes(err.code)) {
      void invitation.refetch();
    }
  };

  if (inv.status !== "PENDING")
    return frame(
      <>
        <Summary invitation={inv} />
        <Closed invitation={inv} />
      </>,
    );

  // Sesión abierta con otra persona: hay que salir antes de aceptar (cuenta nueva o de otro correo).
  const otherUser = authenticated && me.data && !sameEmail(me.data.user.email, inv.email) ? me.data.user : null;

  let body: ReactNode;
  if (authenticated === null || (authenticated && !me.data && !me.isError)) {
    body = <Skeleton className="h-40" />;
  } else if (otherUser) {
    body = (
      <>
        <Alert tone="warning" title="Has iniciado sesión con otra cuenta">
          Estás como {otherUser.email} y la invitación es para {inv.email}. Cierra la sesión para continuar.
        </Alert>
        <Button
          size="lg"
          loading={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await logout();
            setSigningOut(false);
          }}
        >
          Cerrar sesión y continuar
        </Button>
      </>
    );
  } else if (authenticated && me.data) {
    body = (
      <>
        <p className="m-0">
          Estás como <span className="font-medium">{me.data.user.fullName}</span>. {org} se añadirá a tus organizaciones
          y pasará a ser la activa.
        </p>
        {accept.error ? <Alert tone="danger">{acceptErrorMessage(accept.error, inv)}</Alert> : null}
        <Button
          size="lg"
          loading={accept.isPending}
          onClick={() => accept.mutate({ body: {}, withSession: true }, { onSuccess: done, onError })}
        >
          Aceptar y entrar
        </Button>
      </>
    );
  } else if (inv.accountExists) {
    body = (
      <ExistingAccountForm
        invitation={inv}
        pending={accept.isPending}
        error={accept.error}
        submit={(password) =>
          accept.mutate(
            { body: {}, withSession: true, credentials: { email: inv.email, password } },
            { onSuccess: done, onError },
          )
        }
      />
    );
  } else {
    body = (
      <NewAccountForm
        invitation={inv}
        pending={accept.isPending}
        error={accept.error}
        submit={(fullName, password) =>
          accept.mutate({ body: { fullName, password }, withSession: false }, { onSuccess: done, onError })
        }
      />
    );
  }

  return frame(
    <>
      <Summary invitation={inv} />
      {body}
    </>,
  );
}
