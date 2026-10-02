import { describe, expect, it } from "vitest";
import type { ProductionReport } from "@drinks-on-chain/mocks";
import {
  EMPTY_REPORT_FILTERS,
  count,
  hasReportFilters,
  kg,
  liters,
  lossText,
  rangeError,
  ratio,
  reportQuery,
  totalsRows,
} from "./report-model";

describe("filtros del reporte", () => {
  it("sin filtros no envía nada", () => {
    expect(reportQuery(EMPTY_REPORT_FILTERS)).toEqual({});
    expect(hasReportFilters(EMPTY_REPORT_FILTERS)).toBe(false);
  });

  it("fechas, tipo y etapa van al servidor (y al CSV) tal cual", () => {
    const filters = { from: "2026-01-01", to: "2026-09-30", productType: "SINGANI", stage: "BOTTLED" } as const;
    expect(reportQuery(filters)).toEqual({
      from: "2026-01-01",
      to: "2026-09-30",
      productType: "SINGANI",
      stage: ["BOTTLED"],
    });
    expect(hasReportFilters(filters)).toBe(true);
  });

  it("el rango no puede estar invertido", () => {
    expect(rangeError({ from: "2026-09-30", to: "2026-01-01" })).toBe(
      "La fecha final no puede ser anterior a la inicial.",
    );
    expect(rangeError({ from: "2026-01-01", to: "" })).toBeNull();
    expect(rangeError({ from: "ayer", to: "" })).toBe("Fecha no válida.");
  });
});

describe("cifras del reporte", () => {
  it("lo que el servidor no registró se muestra con una raya, no con cero", () => {
    expect(kg(18400)).toBe("18.400 kg");
    expect(liters(null)).toBe("—");
    expect(liters(2212.5)).toBe("2.212,5 L");
    expect(count(2950)).toBe("2.950");
    expect(count(null)).toBe("—");
    expect(ratio(0.657)).toBe("0,66");
    expect(ratio(null)).toBe("—");
  });

  it("junta las mermas registradas por etapa", () => {
    expect(lossText({ fermentation: 2.35, transfer: null, distillation: 87.6, bottling: 1.67 })).toBe(
      "Fermentación 2,4 % · Destilación 87,6 % · Embotellado 1,7 %",
    );
    expect(lossText({ fermentation: null, transfer: null, distillation: null, bottling: null })).toBeNull();
  });

  it("muestra los totales solo de los tipos con lotes", () => {
    const totals = (lots: number): ProductionReport["totals"]["WINE"] => ({
      lots,
      netKg: lots * 1000,
      mustLiters: 0,
      baseWineLiters: 0,
      heartLiters: 0,
      bottledLiters: 0,
      bottles: 0,
      litersPerKg: null,
      bottlesPerTonne: null,
    });
    const rows = totalsRows({ WINE: totals(0), SINGANI: totals(5), UNDECIDED: totals(1) });
    expect(rows.map((r) => [r.key, r.label, r.lots])).toEqual([
      ["SINGANI", "Singani", 5],
      ["UNDECIDED", "Tipo por decidir", 1],
    ]);
  });
});
