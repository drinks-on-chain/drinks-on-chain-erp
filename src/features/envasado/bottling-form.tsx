"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  Modal,
  ModalClose,
  Select,
  SelectGroup,
  SelectItem,
  Skeleton,
  Spinner,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateBottling, useLotViews, useUpload } from "@/lib/erp/hooks";
import { PRODUCT_TYPE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import {
  lockMessage,
  parseDecimal,
  validateBottling,
  type BottlingErrors,
  type BottlingFormValues,
} from "./bottling-form-model";
import { computeYield, yieldInputFromSource } from "./bottling-summary";
import { BottlingSummary } from "./bottling-summary-card";
import { FileInput, fileTooBig } from "./file-input";
import { bottlingSources, resolvePreselected, type BottlingSource, type SourcePreselect } from "./sources";

const pct = (n: number) => fmtNumber(n, Number.isInteger(n) ? 0 : 1);

const CRUMBS = [{ label: "Envasado y QR", href: "/envasado" }, { label: "Nuevo embotellado" }];

const defaultsFor = (source: BottlingSource | null): BottlingFormValues => ({
  finalAbv: source?.productType === "SINGANI" ? "40" : "",
  waterLiters: "",
  bottles: "",
  formatCl: "75",
  bottleType: "",
  bottlingDate: today().toISOString().slice(0, 10),
});

const sourceTitle = (s: BottlingSource) =>
  `${s.kind === "crianza" ? "Crianza" : "Destilación"} · ${s.container}${s.harvest ? ` · ${s.harvest.harvestBatchCode}` : ""}`;

export function BottlingForm({ preselect }: { preselect: SourcePreselect }) {
  const router = useRouter();
  const me = useMe();
  const lots = useLotViews();
  const upload = useUpload();
  const create = useCreateBottling();

  const sources = useMemo(() => (lots.chain ? bottlingSources(lots.chain, today()) : []), [lots.chain]);
  const open = sources.filter((s) => !s.bottled);
  const preselected = useMemo(() => resolvePreselected(sources, preselect), [sources, preselect]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<BottlingFormValues>>({});
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<BottlingErrors>({});
  const [serverError, setServerError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState(false);
  useReturnFocus(confirming);
  const [done, setDone] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const source = sources.find((s) => s.key === (selectedKey ?? preselected?.key)) ?? null;
  const values: BottlingFormValues = { ...defaultsFor(source), ...overrides };
  const set = (k: keyof BottlingFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setOverrides((o) => ({ ...o, [k]: e.target.value }));

  const summary = source
    ? computeYield(
        yieldInputFromSource(source, {
          finalAbv: parseDecimal(values.finalAbv),
          waterLiters: parseDecimal(values.waterLiters),
          bottles: parseDecimal(values.bottles),
          formatCl: parseDecimal(values.formatCl),
        }),
      )
    : null;
  const heartAbv = source?.production?.initialAlcoholPercentage ?? null;
  const finalAbv = parseDecimal(values.finalAbv);

  if (done) {
    return (
      <div className="grid min-h-80 place-items-center" aria-busy="true">
        <PageChrome breadcrumbs={CRUMBS} />
        <ScreenTitle>Nuevo embotellado</ScreenTitle>
        <Spinner label="Generando la identidad del lote…" />
      </div>
    );
  }

  if (me.data && !can(me.data, "bottling.create")) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={CRUMBS} />
        <ScreenTitle>Nuevo embotellado</ScreenTitle>
        <EmptyState
          title="Tu rol no puede cerrar producciones"
          description="El embotellado lo registran la administración y la enología de la bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/envasado">Volver a envasado</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const review = () => {
    setServerError(null);
    const { errors: next, dto } = validateBottling(source, values);
    const fileError = fileTooBig(labelFile) ? "La etiqueta supera los 15 MB." : null;
    setErrors(next);
    setLabelError(fileError);
    if (dto && !fileError) setConfirming(true);
  };

  const submit = async () => {
    const { dto } = validateBottling(source, values);
    if (!dto) return;
    try {
      const labelDesignUrl = labelFile ? (await upload.mutateAsync([labelFile, "labels"])).url : null;
      const created = await create.mutateAsync({ ...dto, labelDesignUrl });
      setDone(true);
      toast({ title: `Lote ${created.internationalLotCode} sellado`, tone: "success" });
      router.push(`/envasado/${created.id}?creado=1`);
    } catch (e) {
      setConfirming(false);
      if (e instanceof ApiError && e.isValidation) setServerError(e);
      else toast({ title: "No se pudo cerrar la producción", description: errorMessage(e), tone: "danger" });
    }
  };

  const pending = upload.isPending || create.isPending;
  const blocked = !!source && (source.locked || source.bottled);
  const serverDetails = Array.isArray(serverError?.details) ? (serverError.details as unknown[]).map(String) : [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={CRUMBS} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Nuevo embotellado</h1>
        <p className="text-fg-muted">
          Cierra la producción de una crianza liberada o de un singani con el reposo cumplido y genera la identidad del
          lote.
        </p>
      </header>

      {lots.isError ? (
        <ErrorState description={errorMessage(lots.error)} onRetry={() => lots.refetch()} retrying={lots.isFetching} />
      ) : lots.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      ) : open.length === 0 && !source ? (
        <EmptyState
          title="No hay nada que embotellar"
          description="Cuando una crianza o un reposo de singani lleguen a cero, aparecerán aquí."
          action={
            <Button asChild variant="secondary">
              <Link href="/lotes">Ver lotes y candados</Link>
            </Button>
          }
        />
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        >
          <Card className="grid min-w-0 gap-6">
            <FormSection title="Origen" description="La crianza (vino) o la destilación (singani) que se envasa.">
              <Field label="Fuente" required error={errors.source && !blocked ? errors.source : undefined}>
                <Select
                  value={source?.key ?? ""}
                  onValueChange={(key) => {
                    setSelectedKey(key);
                    setOverrides({});
                    setErrors({});
                    setServerError(null);
                  }}
                  placeholder="Elige una crianza o destilación"
                  className="w-full min-w-0 [&>span]:truncate"
                >
                  <SelectGroup label="Listas para embotellar">
                    {open.filter((s) => !s.locked).length === 0 && (
                      <SelectItem value="__none" disabled>
                        Ninguna liberada todavía
                      </SelectItem>
                    )}
                    {open
                      .filter((s) => !s.locked)
                      .map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {sourceTitle(s)}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                  {open.some((s) => s.locked) && (
                    <SelectGroup label="Con candado">
                      {open
                        .filter((s) => s.locked)
                        .map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {`${sourceTitle(s)} · ${s.unlockAt ? `hasta ${fmtDate(s.unlockAt)}` : "en reposo"}`}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  )}
                </Select>
              </Field>

              {source && (
                <KeyValueList
                  items={[
                    { term: "Producto", value: PRODUCT_TYPE[source.productType] },
                    {
                      term: "Lote de vendimia",
                      value: source.harvest ? (
                        <Link href={`/lotes/${source.harvest.id}`} className="hover:underline">
                          {source.harvest.harvestBatchCode}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      term: "Parcela",
                      value: source.terroir ? `${source.terroir.parcelName} · ${source.terroir.varietyName}` : "—",
                    },
                    source.aging
                      ? {
                          term: "Crianza",
                          value: (
                            <Link href={`/crianza/${source.aging.id}`} className="hover:underline">
                              {`${source.container} · ${source.aging.volumeLiters ? fmtNumber(source.aging.volumeLiters) + " L" : "volumen sin dato"}`}
                            </Link>
                          ),
                        }
                      : {
                          term: "Destilación",
                          value: (
                            <Link href={`/destilacion/${source.id}`} className="hover:underline">
                              {`${source.container}${heartAbv ? ` · corazón a ${pct(heartAbv)} % vol` : ""}`}
                            </Link>
                          ),
                        },
                  ]}
                />
              )}

              {source?.bottled && (
                <Alert tone="warning" title="Ya embotellado">
                  Esta fuente ya tiene un embotellado registrado.
                </Alert>
              )}
              {source && !source.bottled && source.locked && (
                <Alert tone="warning" icon={<Lock aria-hidden size={18} />} title="Embotellado bloqueado por candado">
                  {lockMessage(source)}
                </Alert>
              )}
            </FormSection>

            <FormSection title="Envasado" columns={2}>
              <Field
                label="Grado alcohólico final"
                required
                error={errors.finalAbv}
                help={source?.productType === "SINGANI" ? "Singani D.O.: habitualmente 40 % vol." : undefined}
              >
                <Input
                  numeric
                  inputMode="decimal"
                  suffix="% vol"
                  value={values.finalAbv}
                  onChange={set("finalAbv")}
                  disabled={blocked}
                />
              </Field>
              {source?.productType === "SINGANI" && (
                <Field
                  label="Adición de agua"
                  error={errors.waterLiters}
                  help={
                    summary?.recommendedWaterLiters != null && heartAbv && finalAbv ? (
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        {`Ajuste de ${pct(heartAbv)} % a ${pct(finalAbv)} % vol: ≈ ${fmtNumber(summary.recommendedWaterLiters)} L`}
                        <button
                          type="button"
                          className="text-accent-text font-medium underline-offset-4 hover:underline"
                          onClick={() =>
                            setOverrides((o) => ({
                              ...o,
                              waterLiters: String(Math.round(summary.recommendedWaterLiters!)),
                            }))
                          }
                        >
                          Usar esta cifra
                        </button>
                      </span>
                    ) : (
                      "Agua desmineralizada para bajar el corazón al grado final."
                    )
                  }
                >
                  <Input
                    numeric
                    inputMode="decimal"
                    suffix="L"
                    value={values.waterLiters}
                    onChange={set("waterLiters")}
                    disabled={blocked}
                  />
                </Field>
              )}
              <Field
                label={`Botellas llenadas${parseDecimal(values.formatCl) ? ` (${fmtNumber(parseDecimal(values.formatCl)! * 10)} ml)` : ""}`}
                required
                error={errors.bottles}
              >
                <Input
                  numeric
                  inputMode="numeric"
                  suffix="ud"
                  value={values.bottles}
                  onChange={set("bottles")}
                  disabled={blocked}
                />
              </Field>
              <Field label="Formato" required error={errors.formatCl}>
                <Input
                  numeric
                  inputMode="decimal"
                  suffix="cl"
                  value={values.formatCl}
                  onChange={set("formatCl")}
                  disabled={blocked}
                />
              </Field>
              <Field label="Tipo de botella" help="Por ejemplo: Bordelesa verde 750 ml." error={errors.bottleType}>
                <Input value={values.bottleType} onChange={set("bottleType")} disabled={blocked} />
              </Field>
              <Field label="Fecha de embotellado" required error={errors.bottlingDate}>
                <Input type="date" value={values.bottlingDate} onChange={set("bottlingDate")} disabled={blocked} />
              </Field>
              <Field
                label="Diseño de la etiqueta"
                help="PNG, JPG o PDF hasta 15 MB. Opcional."
                error={labelError ?? undefined}
              >
                <FileInput onFile={setLabelFile} disabled={blocked} />
              </Field>
            </FormSection>

            {serverError && (
              <Alert
                tone="warning"
                icon={<Lock aria-hidden size={18} />}
                title="El servidor no permitió el embotellado"
              >
                <p>{serverError.message}</p>
                {serverDetails.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {serverDetails.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            <Button type="submit" size="lg" block disabled={!source || blocked}>
              Cerrar producción y generar identidad
            </Button>
          </Card>

          {summary && <BottlingSummary summary={summary} className="lg:sticky lg:top-20" />}
        </form>
      )}

      <Modal
        open={confirming}
        onOpenChange={(o) => !pending && setConfirming(o)}
        title="¿Cerrar la producción?"
        description="Se generará el código internacional del lote y su huella para anclarla en Stellar. No se puede deshacer."
        dismissible={!pending}
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" disabled={pending}>
                Revisar
              </Button>
            </ModalClose>
            <Button onClick={submit} loading={pending}>
              Sí, cerrar y sellar
            </Button>
          </>
        }
      >
        {source && (
          <KeyValueList
            items={[
              { term: "Fuente", value: sourceTitle(source) },
              { term: "Producto", value: PRODUCT_TYPE[source.productType] },
              { term: "Botellas", value: `${values.bottles} × ${values.formatCl} cl` },
              { term: "Grado final", value: `${values.finalAbv} % vol` },
              {
                term: "Fecha",
                value: /^\d{4}-\d{2}-\d{2}$/.test(values.bottlingDate) ? fmtDate(values.bottlingDate) : "—",
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
