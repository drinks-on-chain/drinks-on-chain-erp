"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, toast } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { useMe } from "@/lib/auth/hooks";
import { useCreateLot, useTerroirs } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { NewLotFields } from "./components/new-lot-fields";
import { RulesPreview } from "./components/rules-preview";
import {
  emptyLotForm,
  lotFieldErrors,
  toCreateLotDto,
  type LotFormErrors,
  type LotFormField,
  type LotFormValues,
} from "./lot-model";

const FIELDS: readonly LotFormField[] = [
  "name",
  "harvestYear",
  "productType",
  "estimatedBottles",
  "plannedFormatCl",
  "targetAbvPercent",
  "plannedTerroirIds",
  "targetReadyDate",
  "notes",
];

/** "Nuevo lote" en origen (`POST /v1/lots`): planificación y preventa temprana, antes de pesar uva. */
export function NewLotScreen() {
  const me = useMe();
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Lotes", href: "/lotes" }, { label: "Nuevo lote" }]} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Nuevo lote</h1>
        <p className="m-0 text-sm text-fg-muted">
          El lote agrupa toda la cadena, de la parcela a la botella. También puede nacer al registrar un pesaje o al
          llenar un tanque.
        </p>
      </header>
      {!me.data ? (
        <Skeleton shape="block" className="h-96" />
      ) : !can(me.data, "lot.write") ? (
        <EmptyState
          title="Sin permiso para crear lotes"
          description="Los lotes los crean la dirección de la bodega y enología."
          action={
            <Button asChild variant="secondary">
              <Link href="/lotes">Volver a lotes</Link>
            </Button>
          }
        />
      ) : (
        <NewLotForm />
      )}
    </div>
  );
}

function NewLotForm() {
  const router = useRouter();
  const create = useCreateLot();
  const terroirs = useTerroirs();
  const [values, setValues] = useState<LotFormValues>(() => emptyLotForm(today()));
  const [errors, setErrors] = useState<LotFormErrors>({});
  const [invalid, setInvalid] = useState(false);

  const onChange = <K extends LotFormField>(key: K, value: LotFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
  };

  const activeTerroirs = useMemo(
    () =>
      (terroirs.data?.items ?? [])
        .filter((t) => t.isActive)
        .sort((a, b) => a.parcelName.localeCompare(b.parcelName, "es")),
    [terroirs.data],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.reset();
    const result = toCreateLotDto(values, today());
    setInvalid(!result.ok);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const lot = await create.mutateAsync(result.dto);
      toast({ title: "Lote creado", description: `${lot.reference} · ${lot.name}`, tone: "success" });
      router.push(`/lotes/${lot.id}`);
    } catch (err) {
      setErrors(lotFieldErrors(err));
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Nuevo lote"
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="grid grid-cols-1 gap-6">
        <NewLotFields values={values} errors={errors} onChange={onChange} terroirs={activeTerroirs} />

        {invalid && (
          <p role="alert" className="m-0 text-sm text-danger-text">
            Revisa los campos marcados.
          </p>
        )}
        <RuleViolationNotice error={create.error} fields={FIELDS} />

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Button asChild variant="secondary" size="lg">
            <Link href="/lotes">Cancelar</Link>
          </Button>
          <Button type="submit" size="lg" loading={create.isPending}>
            Crear lote
          </Button>
        </div>
      </div>
      <RulesPreview />
    </form>
  );
}
