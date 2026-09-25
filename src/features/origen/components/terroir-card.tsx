import Link from "next/link";
import type { TerroirResponse } from "@drinks-on-chain/mocks";
import { Card, KeyValueList, Tag } from "@drinks-on-chain/ui";
import { fmtNumber } from "@/lib/format";
import { DoBadge } from "./do-badge";
import { ParcelMap } from "./parcel-map";

/** Tarjeta del directorio de terroirs (01-erp §04): mapa, nombre, altitud, cepa, superficie y D.O. */
export function TerroirCard({ terroir: t }: { terroir: TerroirResponse }) {
  return (
    <Card
      interactive
      className="relative grid content-start gap-3 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus"
    >
      <ParcelMap geometry={t.geographicPolygonGeojson} />
      <h2 className="font-display text-lg leading-tight font-medium">
        <Link href={`/origen/${t.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
          {t.parcelName}
        </Link>
      </h2>
      <KeyValueList
        items={[
          { term: "Altitud", value: `${fmtNumber(t.altitudeMasl)} m` },
          { term: "Cepa", value: t.varietyName },
          { term: "Superficie", value: `${fmtNumber(t.surfaceHectares, 1)} ha` },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <DoBadge {...t} />
        {!t.isActive && <Tag>Inactiva</Tag>}
      </div>
    </Card>
  );
}
