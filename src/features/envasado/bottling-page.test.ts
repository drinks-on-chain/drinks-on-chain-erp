import { describe, expect, it } from "vitest";
import type { BottlingBatchResponse } from "@drinks-on-chain/mocks";
import { bottlingPage, sortBottlings } from "./bottling-page";

const b = (code: string, date: string, bottles: number) =>
  ({
    id: code,
    internationalLotCode: code,
    bottlingDate: date,
    totalBottlesPackaged: bottles,
  }) as BottlingBatchResponse;

const items = [b("B", "2026-03-01", 10), b("A", "2026-05-01", 30), b("C", "2026-01-01", 20)];

describe("sortBottlings", () => {
  it("por defecto, del más reciente al más antiguo", () => {
    expect(sortBottlings(items, null).map((x) => x.id)).toEqual(["A", "B", "C"]);
  });
  it("ordena por código y por botellas en ambos sentidos", () => {
    expect(sortBottlings(items, { columnId: "lot", direction: "asc" }).map((x) => x.id)).toEqual(["A", "B", "C"]);
    expect(sortBottlings(items, { columnId: "bottles", direction: "desc" }).map((x) => x.id)).toEqual(["A", "C", "B"]);
    expect(sortBottlings(items, { columnId: "date", direction: "asc" }).map((x) => x.id)).toEqual(["C", "B", "A"]);
  });
});

describe("bottlingPage", () => {
  it("devuelve solo la página visible", () => {
    const many = Array.from({ length: 45 }, (_, i) => b(`L${i}`, "2026-01-01", i));
    expect(bottlingPage(many, 0)).toHaveLength(20);
    expect(bottlingPage(many, 40).map((x) => x.id)).toEqual(["L40", "L41", "L42", "L43", "L44"]);
  });
});
