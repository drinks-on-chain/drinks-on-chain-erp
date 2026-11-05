"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Lot, LotTokenizationStatus, TokenizationRequest } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  Skeleton,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { isRuleError, parseRuleViolations } from "@/lib/api/rule-violations";
import { useMe } from "@/lib/auth/hooks";
import {
  useCreateTokenizationRequest,
  useLot,
  useLotTokenization,
  useResubmitTokenizationRequest,
  useTokenizationRequest,
  useUpdateTokenizationRequest,
} from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtNumber } from "@/lib/format";
import { CollectionImagesField } from "./components/collection-images-field";
import {
  TOKENIZATION_FORM_FIELDS,
  changeFieldLabel,
  confirmationText,
  emptyTokenizationForm,
  formFromRequest,
  limitsView,
  pendingChangeRequests,
  requestActions,
  toCreateBody,
  toUpdateBody,
  tokenizationFieldErrors,
  validateTokenizationForm,
  type TokenizationFormErrors,
  type TokenizationFormField,
  type TokenizationFormValues,
} from "./tokenization-model";

const tabHref = (lotId: string) => `/lotes/${lotId}?pestana=tokenizacion`;

function Frame({ lot, title, children }: { lot?: Lot; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[
          { label: "Lotes", href: "/lotes" },
          ...(lot ? [{ label: lot.reference, href: tabHref(lot.id) }] : []),
          { label: title },
        ]}
      />
      {children}
    </div>
  );
}

/**
 * «Autorizar tokenización» de un lote, ampliar su cuota o editar una solicitud con cambios pedidos
 * (1K, contrato de la Ola 3 §5.3). Solo el dueño; el servidor decide si el lote es tokenizable y
 * cuánto se puede pedir, y la pantalla explica sus bloqueos.
 */
export function TokenizationRequestScreen({ lotId, requestId }: { lotId: string; requestId?: string }) {
  const me = useMe();
  const allowed = can(me.data, "tokenization.manage");
  const lot = useLot(lotId, allowed);
  const status = useLotTokenization(lotId, allowed);
  const request = useTokenizationRequest(requestId ?? null, allowed);
  const title = requestId ? "Editar la solicitud" : "Autorizar tokenización";

  if (me.data && !allowed) {
    return (
      <Frame title={title}>
        <ScreenTitle>{title}</ScreenTitle>
        <EmptyState
          title="Solo la dirección de la bodega autoriza la tokenización"
          description="La cantidad de botellas que se tokeniza la decide el dueño de la bodega. Puedes consultar el estado en la ficha del lote."
          action={
            <Button asChild variant="secondary">
              <Link href={tabHref(lotId)}>Volver al lote</Link>
            </Button>
          }
        />
      </Frame>
    );
  }

  const failed = [lot, status, ...(requestId ? [request] : [])].find((q) => q.isError);
  if (failed) {
    const missing = failed.error instanceof ApiError && failed.error.isNotFound;
    return (
      <Frame title={title}>
        <ScreenTitle>{title}</ScreenTitle>
        {missing ? (
          <EmptyState
            title={failed === request ? "Solicitud no encontrada" : "Lote no encontrado"}
            description="No existe o pertenece a otra bodega."
            action={
              <Button asChild variant="secondary">
                <Link href="/lotes">Volver a lotes</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(failed.error)}
            onRetry={() => failed.refetch()}
            retrying={failed.isFetching}
          />
        )}
      </Frame>
    );
  }

  if (!lot.data || !status.data || (requestId && !request.data)) {
    return (
      <Frame title={title}>
        <ScreenTitle busy>{title}</ScreenTitle>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton shape="block" className="h-96" />
          <Skeleton shape="block" className="h-64" />
        </div>
      </Frame>
    );
  }

  return (
    <Frame lot={lot.data} title={title}>
      <TokenizationRequestForm
        // Otra solicitud (o pasar de alta a edición) empieza con el formulario limpio.
        key={request.data?.id ?? "nueva"}
        lot={lot.data}
        status={status.data}
        request={requestId ? request.data : undefined}
      />
    </Frame>
  );
}

type FormProps = {
  lot: Lot;
  status: LotTokenizationStatus;
  /** Solicitud que se edita; sin ella, es una autorización nueva o una ampliación. */
  request?: TokenizationRequest;
};

export function TokenizationRequestForm({ lot, status, request }: FormProps) {
  const router = useRouter();
  const create = useCreateTokenizationRequest();
  const update = useUpdateTokenizationRequest();
  const resubmit = useResubmitTokenizationRequest();

  const editing = !!request;
  const increase = editing ? request.kind === "QUOTA_INCREASE" : status.collection !== null;
  // Una ampliación no lleva datos comerciales: la colección ya los tiene.
  const commercial = !increase;
  const changes = request ? pendingChangeRequests(request) : [];
  const actions = request ? requestActions(request, true) : null;
  // Al editar, la cantidad de la propia solicitud no cuenta como «ya pedida».
  const limits = limitsView(
    editing
      ? {
          ...status.limits,
          pendingQuantity: Math.max(0, status.limits.pendingQuantity - request.quantity),
          maxQuantity: status.limits.maxQuantity + request.quantity,
        }
      : status.limits,
  );

  const [values, setValues] = useState<TokenizationFormValues>(() =>
    request ? formFromRequest(request) : emptyTokenizationForm(commercial ? { name: lot.name } : {}),
  );
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<TokenizationFormErrors>({});
  const [invalid, setInvalid] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const busy = create.isPending || update.isPending || resubmit.isPending;
  const heading = editing
    ? `Editar la solicitud de ${lot.name}`
    : increase
      ? `Ampliar la cuota de ${lot.name}`
      : `Autorizar la tokenización de ${lot.name}`;
  const submitLabel = editing
    ? actions?.resubmit
      ? "Guardar y reenviar"
      : "Guardar cambios"
    : increase
      ? "Ampliar cuota"
      : "Autorizar tokenización";

  const set = <K extends TokenizationFormField>(key: K, value: TokenizationFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
  };

  function review(e: FormEvent) {
    e.preventDefault();
    setFailure(null);
    const result = validateTokenizationForm(values, { commercial });
    setInvalid(!result.ok);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setConfirming(result.value.quantity);
  }

  async function send() {
    const result = validateTokenizationForm(values, { commercial });
    if (!result.ok) return;
    try {
      if (request) {
        await update.mutateAsync({ id: request.id, body: toUpdateBody(result.value, { commercial }) });
        if (actions?.resubmit) await resubmit.mutateAsync({ id: request.id, message: message.trim() || undefined });
        toast({
          title: actions?.resubmit ? "Solicitud reenviada" : "Solicitud actualizada",
          description: `${lot.reference} · ${fmtNumber(result.value.quantity)} botellas`,
          tone: "success",
        });
      } else {
        await create.mutateAsync({ lotId: lot.id, body: toCreateBody(result.value, { commercial }) });
        toast({
          title: increase ? "Ampliación solicitada" : "Solicitud de tokenización enviada",
          description: `${lot.reference} · ${fmtNumber(result.value.quantity)} botellas`,
          tone: "success",
        });
      }
      router.push(tabHref(lot.id));
    } catch (err) {
      // El diálogo se cierra y el formulario explica el rechazo (regla del servidor o campo).
      setErrors(tokenizationFieldErrors(err));
      setFailure(err);
      if (!isRuleError(err) && !(err instanceof ApiError && err.isValidation)) {
        throw new Error(errorMessage(err), { cause: err });
      }
    }
  }

  // El servidor dice que ahora no se puede enviar una solicitud nueva: se explica y no hay formulario.
  if (!editing && !status.tokenizable) {
    return (
      <>
        <header className="grid grid-cols-1 gap-1">
          <h1 className="font-display text-3xl">{heading}</h1>
        </header>
        <RuleViolationNotice
          title="Ahora no se puede enviar una solicitud para este lote"
          violations={parseRuleViolations(status.blockers)}
        />
        <div>
          <Button asChild variant="secondary">
            <Link href={tabHref(lot.id)}>Volver a la tokenización del lote</Link>
          </Button>
        </div>
      </>
    );
  }
  if (editing && !actions?.edit) {
    return (
      <>
        <ScreenTitle>{heading}</ScreenTitle>
        <EmptyState
          title="La solicitud ya no se puede editar"
          description="Solo se edita con cambios pedidos o mientras Drinks on Chain no la haya tomado."
          action={
            <Button asChild variant="secondary">
              <Link href={tabHref(lot.id)}>Volver a la tokenización del lote</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">{heading}</h1>
        <p className="m-0 max-w-3xl text-fg-muted">
          {increase
            ? "Pides emitir más NFT del lote, además de los ya autorizados. La ampliación la aprueba Drinks on Chain."
            : "Cada NFT representa una botella del lote. Puedes autorizarla en cualquier momento del proceso, antes de cerrar el expediente (preventa)."}
        </p>
      </header>

      {changes.map((c) => (
        <Alert key={c.id} tone="warning" title="Drinks on Chain pidió cambios" data-testid="change-request">
          <p className="m-0">{c.message}</p>
          {c.fields.length > 0 && (
            <p className="m-0 text-sm">
              <span className="text-fg-muted">Campos a revisar: </span>
              {c.fields.map(changeFieldLabel).join(", ")}
            </p>
          )}
        </Alert>
      ))}

      <form
        noValidate
        onSubmit={review}
        aria-label={heading}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      >
        <Card className="grid grid-cols-1 gap-6">
          <FormSection title="Cuota" description="Cuántas botellas del lote tendrán su NFT." columns={2}>
            <Field
              label={increase ? "Botellas adicionales" : "Botellas a tokenizar"}
              required
              error={errors.quantity}
              help={`Máximo ahora: ${fmtNumber(limits.max)} (según la ${limits.basis === "botellas" ? "cantidad de botellas embotelladas" : "estimación del lote"}).`}
            >
              <Input
                size="lg"
                numeric
                inputMode="numeric"
                suffix="botellas"
                name="quantity"
                value={values.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </Field>
          </FormSection>

          {commercial && (
            <FormSection
              title="Colección"
              description="Lo que verá el comprador en la preventa. Drinks on Chain puede completarlo antes de aprobar."
              columns={2}
            >
              <Field label="Nombre de la colección" required error={errors.name} className="md:col-span-2">
                <Input
                  name="name"
                  value={values.name}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field
                label="Descripción"
                required
                error={errors.description}
                help="Qué es este lote y qué lo hace especial (al menos 20 caracteres)."
                className="md:col-span-2"
              >
                <Textarea
                  name="description"
                  rows={4}
                  value={values.description}
                  maxLength={4000}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <Field label="Notas de cata" error={errors.tastingNotes} help="Opcional.">
                <Textarea
                  name="tastingNotes"
                  rows={3}
                  value={values.tastingNotes}
                  maxLength={2000}
                  onChange={(e) => set("tastingNotes", e.target.value)}
                />
              </Field>
              <Field label="Maridaje" error={errors.pairing} help="Opcional.">
                <Textarea
                  name="pairing"
                  rows={3}
                  value={values.pairing}
                  maxLength={1000}
                  onChange={(e) => set("pairing", e.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <CollectionImagesField
                  value={values.images}
                  onChange={(images) => set("images", images)}
                  onBusyChange={setUploading}
                  error={errors.images}
                  disabled={busy}
                />
              </div>
            </FormSection>
          )}

          <FormSection title="Notas" columns={1}>
            <Field
              label="Notas para Drinks on Chain"
              error={errors.notes}
              help="Opcional. Lo que el equipo de operaciones deba saber al revisar la solicitud."
            >
              <Textarea
                name="notes"
                rows={3}
                value={values.notes}
                maxLength={2000}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            {actions?.resubmit && (
              <Field label="Qué cambiaste" help="Opcional. Acompaña al reenvío.">
                <Textarea
                  name="message"
                  rows={2}
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
            )}
          </FormSection>

          {invalid && (
            <p role="alert" className="m-0 text-sm text-danger-text">
              Revisa los campos marcados.
            </p>
          )}
          <RuleViolationNotice error={failure} fields={TOKENIZATION_FORM_FIELDS} />

          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
            <Button asChild variant="secondary" size="lg">
              <Link href={tabHref(lot.id)}>Cancelar</Link>
            </Button>
            <Button type="submit" size="lg" loading={busy} disabled={uploading}>
              {submitLabel}
            </Button>
          </div>
        </Card>

        <aside className="grid content-start gap-6" aria-label="Límite de la cuota">
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Límite de la cuota" description="Lo calcula el servidor con los datos del lote." />
            <p className="m-0 text-sm" data-testid="limits-summary">
              {limits.summary}
            </p>
            <KeyValueList
              layout="stacked"
              items={[
                { term: "Base del límite", value: limits.basisText },
                {
                  term: limits.basis === "botellas" ? "Botellas del lote" : "Estimación del lote",
                  value: limits.limit != null ? fmtNumber(limits.limit) : "Sin declarar",
                },
                { term: "Ya autorizadas", value: fmtNumber(limits.authorized) },
                ...(limits.pending > 0
                  ? [{ term: "Pedidas en otra solicitud", value: fmtNumber(limits.pending) }]
                  : []),
                { term: "Máximo que puedes pedir", value: fmtNumber(limits.max) },
              ]}
            />
          </Card>
          <Alert tone="info" title="Qué pasa después">
            {status.approvalRequired
              ? "Drinks on Chain revisa la solicitud. Si la aprueba, los NFT se emiten a nombre de la bodega en la red Stellar; publicar la preventa es otro paso, también suyo."
              : "La solicitud se aprueba al enviarla y los NFT se emiten a nombre de la bodega en la red Stellar; publicar la preventa lo hace Drinks on Chain."}
          </Alert>
        </aside>
      </form>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={
          editing
            ? `¿${actions?.resubmit ? "Reenviar" : "Guardar"} la solicitud de ${lot.name}?`
            : increase
              ? `¿Ampliar la cuota de ${lot.name}?`
              : `¿Autorizar la tokenización de ${lot.name}?`
        }
        description={
          confirming !== null
            ? `${confirmationText(confirming, status.approvalRequired)}${increase ? " Se suman a los ya autorizados." : ""} Una cuota aprobada no se puede reducir.`
            : undefined
        }
        confirmLabel={
          confirming !== null
            ? `Sí, ${editing ? (actions?.resubmit ? "reenviar" : "guardar") : increase ? "ampliar en" : "autorizar"} ${fmtNumber(confirming)} ${confirming === 1 ? "botella" : "botellas"}`
            : "Confirmar"
        }
        onConfirm={send}
      />
    </>
  );
}
