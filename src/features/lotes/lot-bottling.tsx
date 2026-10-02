"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreateLotBottlingDto, Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { ScreenTitle } from "@/components/screen-title";
import { UploadField } from "@/features/origen/components/upload-field";
import { toDateInput } from "@/features/vinificacion/form-utils";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { isRuleError, parseRuleViolations } from "@/lib/api/rule-violations";
import { useMe } from "@/lib/auth/hooks";
import {
  useAgings,
  useBottlingPreview,
  useCreateLotBottling,
  useLot,
  useLotBalance,
  useProductions,
} from "@/lib/erp/hooks";
import { LOCK_KIND, LOT_PRODUCT } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtLiters, fmtNumber, numberToInput, parseDecimal } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import {
  bottlingFieldErrors,
  emptyBottling,
  lotBottlingSources,
  suggestedWaterLiters,
  toLotBottlingDto,
  violationField,
  type BottlingErrors,
  type BottlingField,
  type BottlingValues,
} from "./bottling-model";
import { BottlingBalanceMeters, LotBalanceChart } from "./components/lot-balance-chart";
import { LotStageBadge } from "./components/lot-stage-badge";
import { lockRuleText, lockStatusText } from "./lot-model";

const DISPOSITIONS = [
  { value: "RETAINED", label: "Se conserva en la bodega" },
  { value: "DISCARDED", label: "Se descarta" },
];

const ERROR_FIELDS: readonly string[] = [
  "bottlingDate",
  "packagingFormatCl",
  "totalBottlesPackaged",
  "finalAlcoholAbv",
  "waterDilutionLiters",
  "leftover",
  "bottleType",
  "labelDesignKey",
];

/** Embotellado del lote (`/lotes/{id}/embotellar`). */
export function LotBottlingScreen({ lotId }: { lotId: string }) {
  const me = useMe();
  const lot = useLot(lotId);
  const crumbs = [
    { label: "Lotes", href: "/lotes" },
    { label: lot.data?.reference ?? "Lote", href: `/lotes/${lotId}` },
    { label: "Embotellar" },
  ];
  const frame = (body: React.ReactNode, busy = false) => (
    <div className="grid grid-cols-1 gap-6" aria-busy={busy || undefined}>
      <PageChrome breadcrumbs={crumbs} />
      <ScreenTitle busy={busy}>Embotellar el lote</ScreenTitle>
      {body}
    </div>
  );

  if (lot.isError) {
    const missing = lot.error instanceof ApiError && lot.error.isNotFound;
    return frame(
      missing ? (
        <EmptyState
          title="Lote no encontrado"
          description="No existe o pertenece a otra bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/lotes">Volver a lotes</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState description={errorMessage(lot.error)} onRetry={() => lot.refetch()} retrying={lot.isFetching} />
      ),
    );
  }
  if (!lot.data || !me.data) return frame(<Skeleton shape="block" className="h-96" />, true);
  if (!can(me.data, "bottling.create")) {
    return frame(
      <EmptyState
        title="Tu rol no puede embotellar"
        description="El embotellado lo registran enología o la dirección de la bodega."
        action={
          <Button asChild variant="secondary">
            <Link href={`/lotes/${lotId}`}>Volver al lote</Link>
          </Button>
        }
      />,
    );
  }
  return <LotBottlingForm lot={lot.data} crumbs={crumbs} />;
}

function LotBottlingForm({ lot, crumbs }: { lot: Lot; crumbs: { label: string; href?: string }[] }) {
  const router = useRouter();
  const agings = useAgings();
  const productions = useProductions();
  const balance = useLotBalance(lot.id);
  const create = useCreateLotBottling();
  const [values, setValues] = useState<BottlingValues>(() => emptyBottling(toDateInput(today()), lot));
  const [errors, setErrors] = useState<BottlingErrors>({});
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Al registrar, la vista previa deja de pedirse: con el lote ya embotellado respondería 409.
  const [submitted, setSubmitted] = useState(false);

  const sources = useMemo(
    () => lotBottlingSources(lot.id, agings.data?.items ?? [], productions.data?.items ?? []),
    [lot.id, agings.data, productions.data],
  );
  const set = <K extends BottlingField>(key: K, value: BottlingValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Vista previa del servidor: en cuanto el formulario tiene forma válida, se le pide el balance
  // y las reglas que daría por incumplidas. No escribe nada.
  const draft = useMemo(() => toLotBottlingDto(values), [values]);
  const previewBody = useDebounced<CreateLotBottlingDto | null>(draft.ok ? draft.dto : null, 400);
  const preview = useBottlingPreview(lot.id, submitted ? null : previewBody);
  const settled = draft.ok && preview.data && !preview.isFetching && previewBody !== null;
  const violations = useMemo(() => parseRuleViolations(preview.data?.violations), [preview.data]);
  const violated = violations.map((v) => v.code ?? "");
  const previewFieldErrors = useMemo(() => {
    const out: BottlingErrors = {};
    for (const v of violations) {
      const key = violationField(v.field);
      if (key) out[key] ??= v.message;
    }
    return out;
  }, [violations]);
  const fieldError = (key: BottlingField) => errors[key] ?? (draft.ok ? previewFieldErrors[key] : undefined);

  const water = suggestedWaterLiters(sources, parseDecimal(values.finalAlcoholAbv, { grouping: false }));
  const bottled = lot.links.bottlingBatchId !== null;
  const canSubmit = settled && preview.data.valid && !uploading;

  function review() {
    create.reset();
    const result = toLotBottlingDto(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    const result = toLotBottlingDto(values);
    if (!result.ok) return;
    setSubmitted(true);
    try {
      const bottling = await create.mutateAsync({ lotId: lot.id, body: result.dto });
      toast({
        title: "Lote embotellado",
        description: `${bottling.internationalLotCode} · ${fmtNumber(bottling.totalBottlesPackaged)} códigos de botella generados`,
        tone: "success",
      });
      router.push(`/lotes/${lot.id}?pestana=codigos`);
    } catch (err) {
      setSubmitted(false);
      setErrors(bottlingFieldErrors(err));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">Embotellar {lot.name}</h1>
          <LotStageBadge lot={lot} />
        </div>
        <p className="m-0 text-sm text-fg-muted">
          {lot.reference} · {lot.productType ? LOT_PRODUCT[lot.productType] : "Tipo por decidir"}. El lote se embotella
          una sola vez, con todas sus fuentes; al registrarlo se generan su código de lote y un código por botella.
        </p>
      </header>

      {bottled && (
        <Alert
          tone="info"
          title="Este lote ya está embotellado"
          action={
            <Button asChild size="sm" variant="tertiary">
              <Link href={`/lotes/${lot.id}?pestana=codigos`}>Ver sus códigos</Link>
            </Button>
          }
        >
          Cada lote admite un solo embotellado. Si lo intentas de nuevo, el servidor lo rechazará.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection
            title="Fuentes del lote"
            description="Las crianzas o destilaciones abiertas del lote, con su candado evaluado por el servidor."
            columns={1}
          >
            {agings.isPending || productions.isPending ? (
              <Skeleton shape="block" className="h-20" />
            ) : sources.length === 0 ? (
              <p className="m-0 text-sm text-fg-muted">
                El lote no tiene crianzas ni destilaciones abiertas que embotellar.
              </p>
            ) : (
              <ul aria-label="Fuentes del embotellado" className="m-0 grid list-none gap-2 p-0">
                {sources.map((s) => (
                  <li key={s.id} className="grid gap-1 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{s.label}</span>
                      {s.open ? (
                        <Badge tone="info">Destilación abierta</Badge>
                      ) : s.lock ? (
                        <Badge tone={s.lock.released ? "success" : "warning"}>
                          {s.lock.released ? "Candado liberado" : LOCK_KIND[s.lock.kind]}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="m-0 text-sm text-fg-muted tabular-nums">
                      {s.liters != null
                        ? fmtLiters(s.liters, Number.isInteger(s.liters) ? 0 : 1)
                        : "Volumen sin registrar"}
                      {s.abvPercent != null ? ` · al ${fmtNumber(s.abvPercent, 1)} % vol` : ""}
                    </p>
                    {s.lock && (
                      <p className="m-0 text-sm text-fg-muted">
                        {lockRuleText(s.lock)} · {lockStatusText(s.lock)}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </FormSection>

          <FormSection title="Embotellado" columns={2}>
            <Field
              label="Fecha de embotellado"
              required
              error={fieldError("bottlingDate")}
              help="No puede ser futura ni anterior al fin de los candados."
            >
              <Input
                size="lg"
                type="date"
                value={values.bottlingDate}
                onChange={(e) => set("bottlingDate", e.target.value)}
              />
            </Field>
            <Field label="Formato" required error={fieldError("packagingFormatCl")}>
              <Input
                size="lg"
                numeric
                suffix="cL"
                value={values.packagingFormatCl}
                onChange={(e) => set("packagingFormatCl", e.target.value)}
              />
            </Field>
            <Field
              label="Botellas llenadas"
              required
              error={fieldError("totalBottlesPackaged")}
              help={
                settled
                  ? `Caben como máximo ${fmtNumber(preview.data.balance.maxBottles)} botellas.`
                  : "Cada botella recibe su propio código."
              }
            >
              <Input
                size="lg"
                numeric
                suffix="botellas"
                value={values.totalBottlesPackaged}
                onChange={(e) => set("totalBottlesPackaged", e.target.value)}
              />
            </Field>
            <Field label="Grado alcohólico final" required error={fieldError("finalAlcoholAbv")}>
              <Input
                size="lg"
                numeric
                inputMode="text"
                suffix="% vol"
                value={values.finalAlcoholAbv}
                onChange={(e) => set("finalAlcoholAbv", e.target.value)}
              />
            </Field>
            <Field
              label="Adición de agua"
              error={fieldError("waterDilutionLiters")}
              help={
                <span className="grid justify-items-start gap-1">
                  <span>Solo en singani, para bajar el corazón al grado final. En un vino no se admite.</span>
                  {water !== null && (
                    <span className="flex flex-wrap items-center gap-2">
                      Para llegar al grado final harían falta ≈ {fmtLiters(water, Number.isInteger(water) ? 0 : 1)}.
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={() => set("waterDilutionLiters", numberToInput(water))}
                      >
                        Usar esta cifra
                      </Button>
                    </span>
                  )}
                </span>
              }
            >
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.waterDilutionLiters}
                onChange={(e) => set("waterDilutionLiters", e.target.value)}
              />
            </Field>
            <Field label="Tipo de botella" error={fieldError("bottleType")} help="Opcional.">
              <Input size="lg" value={values.bottleType} onChange={(e) => set("bottleType", e.target.value)} />
            </Field>
          </FormSection>

          <FormSection
            title="Remanente"
            description="Lo que no se embotelló y no es merma: se declara para que el balance cuadre."
            columns={2}
          >
            <Field label="Litros de remanente" error={fieldError("leftoverLiters")} help="Opcional.">
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.leftoverLiters}
                onChange={(e) => set("leftoverLiters", e.target.value)}
              />
            </Field>
            <Field label="Destino del remanente">
              <Select
                size="lg"
                value={values.leftoverDisposition}
                onValueChange={(v) => set("leftoverDisposition", v as BottlingValues["leftoverDisposition"])}
                options={DISPOSITIONS}
              />
            </Field>
            <Field
              label="Nota del remanente"
              error={fieldError("leftoverNotes")}
              help="Opcional."
              className="md:col-span-2"
            >
              <Textarea rows={2} value={values.leftoverNotes} onChange={(e) => set("leftoverNotes", e.target.value)} />
            </Field>
          </FormSection>

          <UploadField
            label="Diseño de la etiqueta"
            folder="labels"
            value={values.labelDesignKey}
            onChange={(key) => set("labelDesignKey", key)}
            onBusyChange={setUploading}
            help="Opcional. PDF o imagen, hasta 15 MB."
          />

          <RuleViolationNotice error={create.error} fields={ERROR_FIELDS} />

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
            <Button asChild variant="secondary" size="lg">
              <Link href={`/lotes/${lot.id}`}>Cancelar</Link>
            </Button>
            <Button size="lg" onClick={review} disabled={!canSubmit} loading={create.isPending}>
              Embotellar y generar códigos
            </Button>
          </div>
          {!canSubmit && (
            <p className="m-0 text-right text-sm text-fg-muted">
              {settled
                ? "El servidor no admite este embotellado: corrige lo que indica la vista previa."
                : "El botón se habilita cuando la vista previa del servidor da el balance por válido."}
            </p>
          )}
        </Card>

        <aside className="grid content-start gap-6" aria-label="Vista previa del servidor">
          <Card className="grid gap-4 p-5">
            <CardHeader
              title="Vista previa del balance"
              description="La calcula el servidor con las reglas del lote, sin registrar nada."
            />
            {preview.isError ? (
              isRuleError(preview.error) ? (
                <RuleViolationNotice error={preview.error} />
              ) : (
                <Alert
                  tone="danger"
                  title="No se pudo calcular la vista previa"
                  action={
                    <Button size="sm" variant="tertiary" onClick={() => preview.refetch()}>
                      Reintentar
                    </Button>
                  }
                >
                  {errorMessage(preview.error)}
                </Alert>
              )
            ) : !draft.ok || !preview.data ? (
              <p className="m-0 text-sm text-fg-muted">
                {draft.ok
                  ? "Calculando…"
                  : "Indica la fecha, el formato, las botellas y el grado final para ver el balance."}
              </p>
            ) : (
              <div className="grid gap-4" aria-busy={preview.isFetching || undefined}>
                <Badge tone={preview.data.valid ? "success" : "warning"} className="justify-self-start">
                  {preview.data.valid ? "Balance válido" : "El servidor no lo admitiría"}
                </Badge>
                <BottlingBalanceMeters balance={preview.data.balance} violated={violated} />
                {violations.length > 0 && (
                  <RuleViolationNotice
                    violations={violations}
                    title={
                      violations.length === 1
                        ? "1 regla del lote sin cumplir"
                        : `${violations.length} reglas del lote sin cumplir`
                    }
                  />
                )}
              </div>
            )}
          </Card>

          <Card className="grid gap-4 p-5">
            <CardHeader title="Conciliación del lote" description="De la uva pesada a lo que se embotella." />
            {balance.isError ? (
              <Alert tone="danger" title="No se pudo cargar la conciliación">
                {errorMessage(balance.error)}
              </Alert>
            ) : !balance.data ? (
              <Skeleton shape="block" className="h-40" />
            ) : (
              <LotBalanceChart balance={{ ...balance.data, bottling: null }} />
            )}
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`¿Embotellar ${lot.name}?`}
        description={`Se registran ${values.totalBottlesPackaged} botellas de ${values.packagingFormatCl} cL, se asigna el código de lote y se genera un código por botella. El lote solo se embotella una vez.`}
        confirmLabel="Sí, embotellar"
        onConfirm={submit}
      />
    </div>
  );
}
