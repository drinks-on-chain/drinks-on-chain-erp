"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  RadioGroup,
  Select,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { NewLotFields } from "@/features/lotes/components/new-lot-fields";
import { RulesPreview } from "@/features/lotes/components/rules-preview";
import { emptyLotForm, type LotFormErrors, type LotFormField, type LotFormValues } from "@/features/lotes/lot-model";
import { PhytoBadge } from "@/features/vendimia/components/phyto-badge";
import { toDateInput } from "@/features/vinificacion/form-utils";
import {
  TANK_ERROR_FIELDS,
  lotOfInputs,
  suggestTankCode,
  tankFieldErrors,
  tankLotErrors,
  toCreateTankDto,
  type NewTankField,
  type NewTankValues,
} from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateTank, useHarvestBatches, useLots, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { LOT_PRODUCT } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtKg, fmtNumber, numberToInput, parseDecimal } from "@/lib/format";

const FORM_ID = "new-tank-form";

/** Etapas en las que un lote admite tanques nuevos (contrato de la Ola 2 §4.1). */
const OPEN_STAGES = ["ORIGIN", "HARVEST", "FERMENTING"] as const;

/**
 * Llenar un tanque (contrato de la Ola 2 §4.1): uno o varios pesajes de un mismo lote con sus
 * kilos, el volumen de mosto y la fecha. Si la uva no tiene lote, se elige uno o nace aquí. El
 * destino (vino o singani) no se fija al llenar: se decide al completar la fermentación.
 */
export function NewTankForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const tanks = useTanks();
  const lots = useLots({ stage: OPEN_STAGES });
  const createTank = useCreateTank();
  const preselected = params.get("vendimia");
  const preferredLot = params.get("lote");

  const [values, setValues] = useState<Omit<NewTankValues, "tankCode" | "inputs"> & { tankCode: string | null }>(
    () => ({
      lotChoice: "auto",
      tankCode: null,
      capacityLiters: "",
      material: "Acero inoxidable AISI 316",
      volumeFilledLiters: "",
      startFermentation: true,
      startDate: toDateInput(today()),
    }),
  );
  /** `null` hasta que la persona toca la lista: mientras tanto vale el pesaje de la URL. */
  const [picked, setPicked] = useState<Record<string, string> | null>(null);
  const [newLot, setNewLot] = useState<LotFormValues>(() => emptyLotForm(today()));
  const [errors, setErrors] = useState<Partial<Record<NewTankField, string>>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [lotErrors, setLotErrors] = useState<LotFormErrors>({});
  const [invalid, setInvalid] = useState(false);

  // Uva que aún puede entrar a un tanque: con kilos disponibles y sin dictamen negativo. Si su
  // dictamen permite fermentar lo decide el servidor con las reglas del lote.
  const candidates = useMemo(
    () =>
      (harvest.data?.items ?? [])
        .filter((h) => (h.availableKg ?? h.netWeightKg) > 0 && h.phytosanitaryStatus !== "REJECTED")
        .filter((h) => !preferredLot || h.lotId === preferredLot || h.lotId === null)
        .sort((a, b) => b.intakeDate.localeCompare(a.intakeDate)),
    [harvest.data, preferredLot],
  );
  const terroirById = useMemo(() => new Map((terroirs.data?.items ?? []).map((t) => [t.id, t])), [terroirs.data]);
  const lotById = useMemo(() => new Map((lots.data?.items ?? []).map((l) => [l.id, l])), [lots.data]);
  const available = (id: string) => {
    const h = candidates.find((x) => x.id === id);
    return h ? (h.availableKg ?? h.netWeightKg) : 0;
  };

  const inputs = useMemo<Record<string, string>>(() => {
    if (picked) return picked;
    const h = candidates.find((x) => x.id === preselected);
    return h ? { [h.id]: numberToInput(h.availableKg ?? h.netWeightKg) } : {};
  }, [picked, candidates, preselected]);

  const allTanks = tanks.data?.items ?? [];
  const suggestedCode = suggestTankCode(allTanks.map((t) => t.tankCode));
  const tankCode = values.tankCode ?? suggestedCode;
  const existingLotId = lotOfInputs(inputs, candidates);
  const existingLot = existingLotId ? lotById.get(existingLotId) : undefined;
  const hasInputs = Object.keys(inputs).length > 0;
  const lotChoice = existingLotId ? "auto" : values.lotChoice === "auto" ? (preferredLot ?? "new") : values.lotChoice;
  const totalKg = Object.entries(inputs).reduce((sum, [id, kg]) => sum + (parseDecimal(kg) ?? available(id)), 0);

  const set = (k: Exclude<NewTankField, "inputs">, value: string) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const toggleInput = (id: string, checked: boolean) => {
    const next = { ...inputs };
    if (checked) next[id] = numberToInput(available(id));
    else delete next[id];
    setPicked(next);
    setErrors((x) => ({ ...x, inputs: undefined }));
  };
  const setKg = (id: string, kg: string) => {
    setPicked({ ...inputs, [id]: kg });
    setInputErrors((x) => {
      const next = { ...x };
      delete next[id];
      return next;
    });
  };
  const setLot = <K extends LotFormField>(key: K, value: LotFormValues[K]) => {
    setNewLot((v) => ({ ...v, [key]: value }));
    setLotErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    createTank.reset();
    const result = toCreateTankDto(
      { ...values, inputs, lotChoice, tankCode },
      { harvests: candidates, today: today(), newLot },
    );
    setInvalid(!result.ok);
    if (!result.ok) {
      setErrors(result.errors);
      setInputErrors(result.inputErrors);
      setLotErrors(result.lotErrors);
      return;
    }
    try {
      const tank = await createTank.mutateAsync(result.dto);
      toast({
        title: `${tank.tankCode} ${values.startFermentation ? "en marcha" : "llenándose"}`,
        description: "El destino se decide al completar la fermentación.",
        tone: "success",
      });
      router.push(`/vinificacion/${tank.id}`);
    } catch (err) {
      setErrors(tankFieldErrors(err));
      setLotErrors(tankLotErrors(err));
    }
  };

  const allowed = can(me.data, "tank.create");
  const loading = harvest.isPending || terroirs.isPending || tanks.isPending || lots.isPending || me.isPending;
  const failed = harvest.isError || terroirs.isError || tanks.isError || lots.isError;

  const chrome = (
    <PageChrome
      breadcrumbs={[{ label: "Vinificación", href: "/vinificacion" }, { label: "Llenar tanque" }]}
      actions={
        allowed && !loading && !failed && candidates.length > 0 ? (
          <Button type="submit" form={FORM_ID} loading={createTank.isPending}>
            Llenar tanque
          </Button>
        ) : null
      }
    />
  );

  const header = (
    <div>
      <h1 className="font-display text-3xl">Llenar tanque</h1>
      <p className="m-0 text-fg-muted">
        Registra la uva que entra, el volumen de mosto y la fecha. El destino (vino o singani) se decide al completar la
        fermentación.
      </p>
    </div>
  );

  if (loading)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        {header}
        <Skeleton className="h-10 w-72" />
        <Skeleton shape="block" className="h-96" />
      </div>
    );
  if (failed)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        {header}
        <ErrorState
          description={errorMessage(harvest.error ?? terroirs.error ?? tanks.error ?? lots.error)}
          onRetry={() => Promise.all([harvest.refetch(), terroirs.refetch(), tanks.refetch(), lots.refetch()])}
          retrying={harvest.isFetching}
        />
      </div>
    );
  if (!allowed)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        {header}
        <EmptyState
          title="Tu rol no puede llenar tanques"
          description="Llenar un tanque es tarea de enología o de la dirección de la bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/vinificacion">Volver al mapa de tanques</Link>
            </Button>
          }
        />
      </div>
    );
  if (candidates.length === 0)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        {header}
        <EmptyState
          title="No hay uva disponible para vinificar"
          description="Entra al tanque la uva pesada que aún tiene kilos disponibles. Registra un pesaje o revisa su dictamen."
          action={
            <Button asChild variant="secondary">
              <Link href="/vendimia">Ir a vendimia</Link>
            </Button>
          }
        />
      </div>
    );

  const lotOptions = [
    { value: "new", label: "Nuevo lote…" },
    ...(lots.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.name} · ${l.reference}` })),
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      {chrome}
      {header}

      <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection
            title="Uva que entra"
            description="Uno o varios pesajes de un mismo lote. Si el dictamen de la uva permite fermentar lo comprueba el servidor."
            columns={1}
          >
            <fieldset
              className="m-0 grid gap-3 border-0 p-0"
              aria-describedby={errors.inputs ? "tank-inputs-error" : undefined}
            >
              <legend className="sr-only">Pesajes que entran al tanque</legend>
              {candidates.map((h) => {
                const t = terroirById.get(h.terroirId);
                const lot = h.lotId ? lotById.get(h.lotId) : undefined;
                const checked = h.id in inputs;
                return (
                  <div
                    key={h.id}
                    className="grid items-start gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_12rem]"
                  >
                    <div className="grid gap-1">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleInput(h.id, c === true)}
                        label={h.harvestBatchCode}
                        description={[
                          t ? `${t.parcelName} · ${t.varietyName}` : null,
                          `${fmtKg(h.availableKg ?? h.netWeightKg)} disponibles`,
                          h.lotId ? (lot ? lot.name : "Con lote") : "Sin lote",
                          fmtDate(h.intakeDate),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <span className="pl-7">
                        <PhytoBadge status={h.phytosanitaryStatus} />
                      </span>
                    </div>
                    {checked && (
                      <Field label={`Kilos de ${h.harvestBatchCode}`} error={inputErrors[h.id]}>
                        <Input
                          numeric
                          suffix="kg"
                          value={inputs[h.id] ?? ""}
                          onChange={(e) => setKg(h.id, e.target.value)}
                        />
                      </Field>
                    )}
                  </div>
                );
              })}
              {errors.inputs && (
                <p id="tank-inputs-error" role="alert" className="m-0 text-sm text-danger-text">
                  {errors.inputs}
                </p>
              )}
            </fieldset>
          </FormSection>

          {hasInputs && !existingLotId && (
            <FormSection
              title="Lote"
              description="La uva elegida aún no pertenece a un lote: se asigna a uno existente o nace aquí."
              columns={1}
            >
              <Field label="Lote del tanque" required error={errors.lotChoice}>
                <Select size="lg" value={lotChoice} onValueChange={(v) => set("lotChoice", v)} options={lotOptions} />
              </Field>
              {lotChoice === "new" && (
                <NewLotFields values={newLot} errors={lotErrors} onChange={setLot} compact hideYear />
              )}
            </FormSection>
          )}

          <FormSection title="Tanque" columns={2}>
            <Field
              label="Código del tanque"
              required
              error={errors.tankCode}
              help={`Siguiente libre: ${suggestedCode}. Un tanque físico no se reutiliza hasta limpiarlo.`}
            >
              <Input size="lg" value={tankCode} onChange={(e) => set("tankCode", e.target.value)} />
            </Field>
            <Field label="Material">
              <Input
                size="lg"
                value={values.material}
                onChange={(e) => setValues((v) => ({ ...v, material: e.target.value }))}
              />
            </Field>
            <Field label="Capacidad" error={errors.capacityLiters} help="Opcional.">
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.capacityLiters}
                onChange={(e) => set("capacityLiters", e.target.value)}
              />
            </Field>
            <Field
              label="Volumen llenado"
              required
              error={errors.volumeFilledLiters}
              help={
                parseDecimal(values.capacityLiters) && parseDecimal(values.volumeFilledLiters) !== null
                  ? `${fmtNumber(Math.round((parseDecimal(values.volumeFilledLiters)! / parseDecimal(values.capacityLiters)!) * 100))} % de la capacidad.`
                  : "Litros de mosto que entran al tanque."
              }
            >
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.volumeFilledLiters}
                onChange={(e) => set("volumeFilledLiters", e.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Estado y fecha" columns={2}>
            <Field label="Estado inicial" required>
              <RadioGroup
                variant="card"
                value={values.startFermentation ? "FERMENTING" : "FILLING"}
                onValueChange={(v) => setValues((x) => ({ ...x, startFermentation: v === "FERMENTING" }))}
                options={[
                  { value: "FILLING", label: "Llenando", description: "El mosto aún está entrando." },
                  { value: "FERMENTING", label: "Fermentando", description: "Empieza la bitácora diaria." },
                ]}
              />
            </Field>
            <Field
              label="Fecha de inicio"
              required
              error={errors.startDate}
              help="No puede ser anterior al último ingreso de la uva elegida."
            >
              <Input
                size="lg"
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
          </FormSection>

          {invalid && (
            <p role="alert" className="m-0 text-sm text-danger-text">
              Revisa los campos marcados.
            </p>
          )}
          <RuleViolationNotice error={createTank.error} fields={TANK_ERROR_FIELDS} />
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="p-5">
            <CardHeader title="Resumen" className="mb-3" />
            {hasInputs ? (
              <KeyValueList
                layout="stacked"
                items={[
                  { term: "Pesajes", value: Object.keys(inputs).length },
                  { term: "Uva que entra", value: fmtKg(totalKg) },
                  {
                    term: "Lote",
                    value: existingLotId
                      ? existingLot
                        ? `${existingLot.name} · ${existingLot.reference}`
                        : "El de la uva elegida"
                      : lotChoice === "new"
                        ? "Lote nuevo"
                        : (lotById.get(lotChoice)?.name ?? "—"),
                  },
                  ...(existingLot
                    ? [
                        {
                          term: "Tipo del lote",
                          value: existingLot.productType ? LOT_PRODUCT[existingLot.productType] : "Por decidir",
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <p className="m-0 text-sm text-fg-muted">Elige la uva que entra al tanque para ver el resumen.</p>
            )}
          </Card>
          <Alert tone="info" title="El destino se decide al completar">
            Vino (crianza) o singani (destilación): la bifurcación se elige al completar la fermentación y fija el tipo
            del lote. Para singani, el servidor comprueba entonces la D.O. de toda la uva del lote.
          </Alert>
          {hasInputs && !existingLotId && lotChoice === "new" && <RulesPreview />}
        </aside>
      </form>
    </div>
  );
}
