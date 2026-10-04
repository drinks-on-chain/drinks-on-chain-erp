import { describe, expect, it } from "vitest";
import type { LotGraph } from "@drinks-on-chain/mocks";
import { emptyAttachment, sizeText, toAttachmentDto, KIND_FOLDER } from "./attachments-model";
import { canonicalFilename, progressText, requirementViews } from "./dossier-model";
import { graphQuantity, graphStages, metricView } from "./graph-model";

describe("requisitos del expediente", () => {
  const requirements = [
    { key: "BOTTLED" as const, met: true, message: "Embotellado CVJ-2026-SINGANI-004 registrado" },
    { key: "LAB_CONFORMING" as const, met: false, message: "Falta registrar el análisis de laboratorio" },
    { key: "NO_OPEN_SOURCES" as const, met: true, message: "Todas las crianzas y destilaciones están cerradas" },
  ];

  it("muestra el mensaje del servidor y a dónde ir para lo pendiente", () => {
    const views = requirementViews("lot-1", requirements);
    expect(views.map((v) => [v.title, v.met])).toEqual([
      ["Lote embotellado", true],
      ["Laboratorio conforme", false],
      ["Sin crianzas ni destilaciones abiertas", true],
    ]);
    expect(views[0]!.action).toBeNull();
    expect(views[1]).toMatchObject({
      message: "Falta registrar el análisis de laboratorio",
      action: { label: "Ir al laboratorio", href: "/lotes/lot-1?pestana=laboratorio" },
    });
    expect(progressText(requirements)).toBe("2 de 3 requisitos cumplidos");
  });

  it("nombra el JSON canónico con el código de lote o, sin él, la referencia", () => {
    expect(canonicalFilename({ lotCode: "CVJ-2026-SINGANI-004", reference: "CVJ-L2026-005" })).toBe(
      "expediente-CVJ-2026-SINGANI-004.json",
    );
    expect(canonicalFilename({ lotCode: null, reference: "CVJ-L2026-005" })).toBe("expediente-CVJ-L2026-005.json");
  });
});

describe("grafo del lote", () => {
  const node = (id: string, type: LotGraph["nodes"][number]["type"], label: string, occurredAt: string) => ({
    id,
    type,
    label,
    occurredAt,
    recordedAt: occurredAt,
    quantity: null,
    metrics: [],
    actor: null,
    status: "OK",
    corrected: false,
  });
  const graph: Pick<LotGraph, "nodes" | "edges"> = {
    nodes: [
      { ...node("t1", "TANK", "TK-13", "2026-03-10T00:00:00Z"), quantity: { value: 12100, unit: "L" } },
      node("p1", "TERROIR", "Parcela 8", "2026-01-01T00:00:00Z"),
      {
        ...node("h1", "HARVEST_BATCH", "HARV-2026-008", "2026-03-09T00:00:00Z"),
        quantity: { value: 18400, unit: "kg" },
        metrics: [
          { key: "brix", label: "Brix", value: 23.4, unit: "°Bx" },
          { key: "ph", label: "pH", value: null, unit: null },
        ],
      },
    ],
    edges: [
      { from: "p1", to: "h1", quantity: null },
      { from: "h1", to: "t1", quantity: { value: 18400, unit: "kg" } },
    ],
  };

  it("ordena las etapas por el proceso y dice de dónde recibe cada registro", () => {
    const stages = graphStages(graph);
    expect(stages.map((s) => s.title)).toEqual(["Parcelas", "Pesajes", "Tanques"]);
    expect(stages[1]!.nodes[0]!.inputs).toEqual(["De Parcela 8"]);
    expect(stages[2]!.nodes[0]!.inputs).toEqual(["18.400 kg de HARV-2026-008"]);
  });

  it("lo que no se midió se lee «No registrado», sin cifras inventadas", () => {
    const metrics = graphStages(graph)[1]!.nodes[0]!.metricViews;
    expect(metrics).toEqual([
      { key: "brix", label: "Brix", text: "23,40 °Bx", recorded: true },
      { key: "ph", label: "pH", text: "No registrado", recorded: false },
    ]);
    expect(metricView({ key: "estado", label: "Estado", value: "Aprobado", unit: null }).text).toBe("Aprobado");
    expect(graphQuantity({ value: 2950, unit: "bottles" })).toBe("2.950 botellas");
    expect(graphQuantity(null)).toBeNull();
  });
});

describe("archivos del lote", () => {
  it("pide título y archivo; la visibilidad inicial la pone el servidor", () => {
    const empty = toAttachmentDto(emptyAttachment());
    expect(empty).toEqual({ ok: false, errors: { title: "Ponle un título al archivo.", key: "Elige el archivo." } });
    expect(
      toAttachmentDto({ kind: "DO_CERTIFICATE", title: " Certificado D.O. 2026 ", key: "org/x/certificates/a.pdf" }),
    ).toEqual({
      ok: true,
      dto: { kind: "DO_CERTIFICATE", title: "Certificado D.O. 2026", key: "org/x/certificates/a.pdf" },
    });
  });

  it("cada tipo va a su carpeta y el tamaño se lee en unidades legibles", () => {
    expect(KIND_FOLDER.LAB_REPORT).toBe("lab-reports");
    expect(KIND_FOLDER.PHYTO_REPORT).toBe("inspections");
    expect(sizeText(512)).toBe("512 B");
    expect(sizeText(188_416)).toBe("184 KB");
    expect(sizeText(2_516_582)).toBe("2,4 MB");
  });
});
