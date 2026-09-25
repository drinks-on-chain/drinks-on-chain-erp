"use client";

import { useMemo, useState } from "react";
import { Download, FileArchive, FileSpreadsheet } from "lucide-react";
import { Alert, Button, Card, CardHeader, Progress, QRCode, toast } from "@drinks-on-chain/ui";
import { env } from "@/lib/env";
import { fmtNumber } from "@/lib/format";
import { ExternalLink } from "@/features/cuenta/stellar";
import { bottleCodes, fileSafe, marketplaceOrigin, passportUrl } from "./qr-codes";
import { codesZip, csvBlob, downloadBlob, qrPng, qrSvg } from "./qr-export";

const PREVIEW = 6;

/**
 * QrExportCard (05 §3.3): el QR del lote que lleva al pasaporte del Marketplace y la
 * exportación de los códigos por botella (provisionales, 09 §8 punto 10).
 */
export function QrExportCard({
  lotCode,
  qrBatchUrl,
  bottles,
}: {
  lotCode: string;
  qrBatchUrl: string | null | undefined;
  bottles: number;
}) {
  const origin = marketplaceOrigin(env.urlApp, qrBatchUrl);
  const lotUrl = origin ? passportUrl(origin, lotCode) : null;
  const preview = useMemo(
    () => (origin ? bottleCodes(lotCode, Math.min(bottles, PREVIEW), origin) : []),
    [origin, lotCode, bottles],
  );
  const [progress, setProgress] = useState<number | null>(null);
  const name = fileSafe(lotCode);

  if (!lotUrl || !origin) {
    return (
      <Card className="grid grid-cols-1 gap-4">
        <CardHeader title="Códigos QR" />
        <Alert tone="warning" title="Sin dirección del pasaporte">
          El backend no devolvió la URL del lote y NEXT_PUBLIC_URL_APP no está configurada. Configúrala para generar los
          códigos.
        </Alert>
      </Card>
    );
  }

  const run = async (what: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
    } catch (e) {
      toast({
        title: `No se pudo generar ${what}`,
        description: e instanceof Error ? e.message : undefined,
        tone: "danger",
      });
    }
  };

  const exportZip = () =>
    run("el ZIP", async () => {
      setProgress(0);
      try {
        const blob = await codesZip(lotCode, lotUrl, bottleCodes(lotCode, bottles, origin), setProgress);
        downloadBlob(blob, `qr-${name}.zip`);
        toast({ title: `${fmtNumber(bottles)} códigos exportados`, tone: "success" });
      } finally {
        setProgress(null);
      }
    });

  return (
    <Card className="grid grid-cols-1 gap-5" aria-labelledby="qr-export-title">
      <CardHeader
        title={<span id="qr-export-title">Códigos QR</span>}
        description={
          <>
            Apuntan al pasaporte del lote en el Marketplace: <code className="font-mono text-xs">{lotUrl}</code>
          </>
        }
      />
      <div className="flex flex-wrap items-start gap-5">
        <QRCode value={lotUrl} size={176} label={`Código QR del lote ${lotCode}`} className="border-border border" />
        <div className="grid min-w-0 flex-1 gap-3">
          <p className="text-sm">
            <span className="text-fg-muted">Código del lote</span>
            <br />
            <span className="font-mono font-medium">{lotCode}</span>
          </p>
          <ExternalLink href={lotUrl}>Abrir pasaporte</ExternalLink>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              iconStart={<Download aria-hidden size={16} />}
              onClick={() => run("el PNG", async () => downloadBlob(await qrPng(lotUrl), `qr-lote-${name}.png`))}
            >
              PNG
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<Download aria-hidden size={16} />}
              onClick={() =>
                run("el SVG", () =>
                  downloadBlob(
                    new Blob([qrSvg(lotUrl, { label: lotCode })], { type: "image/svg+xml" }),
                    `qr-lote-${name}.svg`,
                  ),
                )
              }
            >
              SVG
            </Button>
          </div>
        </div>
      </div>

      {qrBatchUrl && qrBatchUrl !== lotUrl && (
        <p className="text-fg-subtle text-xs">
          El backend registra <code className="font-mono">{qrBatchUrl}</code>; se usa la dirección del Marketplace
          (pendiente de alinear, 09 §8 punto 2).
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        <h3 className="text-sm font-medium">
          Lote de códigos por botella · {fmtNumber(bottles)} {bottles === 1 ? "código" : "códigos"}
        </h3>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Vista previa de códigos por botella">
          {preview.map((c) => (
            <li key={c.code} className="grid gap-1 text-center">
              <QRCode value={c.url} size={88} label={`Código ${c.code}`} className="h-auto w-full" />
              <span className="text-fg-subtle font-mono text-2xs">{c.serial}</span>
            </li>
          ))}
        </ul>
        <Alert tone="info" title="Códigos provisionales">
          El backend emite hoy un solo código por lote. Los códigos por botella ({lotCode}-0001…) llevan al mismo
          pasaporte con el número de botella y se sustituirán cuando existan códigos individuales.
        </Alert>
        {progress !== null && <Progress value={Math.round(progress * 100)} max={100} label="Generando códigos" />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            iconStart={<FileSpreadsheet aria-hidden size={18} />}
            disabled={bottles <= 0}
            onClick={() =>
              run("el CSV", () =>
                downloadBlob(csvBlob(lotCode, bottleCodes(lotCode, bottles, origin)), `qr-${name}.csv`),
              )
            }
          >
            Descargar CSV
          </Button>
          <Button
            iconStart={<FileArchive aria-hidden size={18} />}
            loading={progress !== null}
            disabled={bottles <= 0}
            onClick={exportZip}
          >
            Exportar lote de códigos QR
          </Button>
        </div>
      </div>
    </Card>
  );
}
