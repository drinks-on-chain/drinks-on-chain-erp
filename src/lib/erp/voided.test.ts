import { describe, expect, it } from "vitest";
import { latestLog } from "@/features/vinificacion/tank-model";
import { isCurrentLab } from "@/features/lotes/lab-model";
import { activeOnly, isVoided } from "./voided";

describe("registros anulados", () => {
  it("un registro anulado llega marcado y queda fuera de lo que cuenta", () => {
    expect(isVoided({ voided: true })).toBe(true);
    expect(isVoided({ voidedAt: "2026-09-25T12:00:00Z" })).toBe(true);
    expect(isVoided({ voided: false, voidedAt: null })).toBe(false);
    expect(isVoided({})).toBe(false);
    expect(activeOnly([{ id: 1 }, { id: 2, voided: true }]).map((r) => r.id)).toEqual([1]);
    expect(activeOnly(undefined)).toEqual([]);
  });

  it("la última lectura del tanque es la última sin anular", () => {
    const logs = [
      { recordedAt: "2026-09-23T08:00:00Z", temperatureCelsius: 22 },
      { recordedAt: "2026-09-24T08:00:00Z", temperatureCelsius: 23 },
      { recordedAt: "2026-09-25T08:00:00Z", temperatureCelsius: 41, voided: true, voidedAt: "2026-09-25T09:00:00Z" },
    ];
    expect(latestLog(logs)?.temperatureCelsius).toBe(23);
    expect(latestLog([logs[2]!])).toBeUndefined();
  });

  it("un análisis de laboratorio anulado nunca es el vigente", () => {
    expect(isCurrentLab({ current: true, supersededAt: null })).toBe(true);
    expect(isCurrentLab({ supersededAt: null })).toBe(true);
    expect(isCurrentLab({ current: false, supersededAt: "2026-09-25T12:00:00Z" })).toBe(false);
    expect(isCurrentLab({ current: true, supersededAt: null, voided: true })).toBe(false);
    expect(isCurrentLab({ supersededAt: null, voidedAt: "2026-09-25T12:00:00Z" })).toBe(false);
  });
});
