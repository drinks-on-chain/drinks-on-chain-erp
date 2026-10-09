import { describe, expect, it } from "vitest";
import { tokenizationFixtures } from "@drinks-on-chain/mocks/fixtures";
import { CreateTokenizationRequestSchema, UpdateTokenizationRequestSchema } from "@drinks-on-chain/mocks";
import type { TokenizationLimits } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import {
  addImage,
  changeFieldLabel,
  closureSummary,
  confirmationText,
  emptyTokenizationForm,
  formFromRequest,
  limitsView,
  markView,
  pendingChangeRequests,
  removeImage,
  requestActions,
  requestQuantityText,
  setAlt,
  setCover,
  toCreateBody,
  toUpdateBody,
  tokenizationFieldErrors,
  validateTokenizationForm,
  withSingleCover,
} from "./tokenization-model";

const limits = (over: Partial<TokenizationLimits> = {}): TokenizationLimits => ({
  basis: "ESTIMATE",
  estimatedBottles: 3000,
  bottles: null,
  authorizedQuota: 0,
  pendingQuantity: 0,
  maxQuantity: 3000,
  ...over,
});

const valid = emptyTokenizationForm({
  quantity: "100",
  name: "Singani Preventa 2026",
  description: "Singani de altura de la Destilería Cinti Viejo, en preventa.",
});

describe("marca de tokenización del lote", () => {
  it("sin solicitud ni colección no hay marca", () => {
    expect(markView({ state: "NONE", quota: 0, minted: 0, collectionId: null })).toBeNull();
  });

  it("estado con su tono y los NFT emitidos sobre la cuota", () => {
    expect(markView({ state: "REQUESTED", quota: 0, minted: 0, collectionId: null })).toEqual({
      label: "Solicitud enviada",
      tone: "info",
      detail: null,
    });
    expect(markView({ state: "MINTING", quota: 1500, minted: 0, collectionId: "c" })).toMatchObject({
      label: "Emitiendo NFT",
      detail: "0 de 1.500 NFT",
    });
    expect(markView({ state: "MINT_FAILED", quota: 100, minted: 0, collectionId: "c" })?.tone).toBe("danger");
    expect(markView({ state: "PUBLISHED", quota: 100, minted: 100, collectionId: "c" })?.detail).toBe("100 de 100 NFT");
  });
});

describe("límite de la cuota (lo calcula el servidor)", () => {
  it("antes del embotellado, sobre la estimación", () => {
    const view = limitsView(limits({ authorizedQuota: 100, maxQuantity: 2900 }));
    expect(view.basis).toBe("estimación");
    expect(view.limit).toBe(3000);
    expect(view.summary).toBe(
      "Puedes autorizar hasta 2.900 botellas: la estimación del lote es 3.000 y ya hay 100 autorizadas.",
    );
  });

  it("desde el embotellado, sobre las botellas con código activo", () => {
    const view = limitsView(
      limits({ basis: "BOTTLES", bottles: 1040, authorizedQuota: 240, pendingQuantity: 500, maxQuantity: 300 }),
    );
    expect(view.basis).toBe("botellas");
    expect(view.limit).toBe(1040);
    expect(view.summary).toBe(
      "Puedes autorizar hasta 300 botellas: el lote tiene 1.040 botellas embotelladas y ya hay 240 autorizadas y 500 pedidas.",
    );
  });

  it("sin cuota disponible o sin estimación lo dice", () => {
    expect(limitsView(limits({ authorizedQuota: 3000, maxQuantity: 0 })).summary).toBe(
      "No queda cuota por autorizar: la estimación del lote es 3.000 y ya hay 3.000 autorizadas.",
    );
    expect(limitsView(limits({ estimatedBottles: null, maxQuantity: 0 })).summary).toBe(
      "No queda cuota por autorizar: el lote aún no tiene estimación de botellas.",
    );
    expect(limitsView(limits({ maxQuantity: 1, estimatedBottles: 1 })).summary).toContain("hasta 1 botella:");
  });
});

describe("solicitud", () => {
  it("el dueño edita con cambios pedidos o sin tomar, reenvía con cambios pedidos y retira lo abierto", () => {
    const assignee = { userId: "u", fullName: "Valeria Méndez" };
    expect(requestActions({ status: "SUBMITTED", assignee: null }, true)).toEqual({
      edit: true,
      resubmit: false,
      withdraw: true,
    });
    expect(requestActions({ status: "IN_REVIEW", assignee }, true)).toEqual({
      edit: false,
      resubmit: false,
      withdraw: true,
    });
    expect(requestActions({ status: "CHANGES_REQUESTED", assignee }, true)).toEqual({
      edit: true,
      resubmit: true,
      withdraw: true,
    });
    for (const status of ["APPROVED", "REJECTED", "WITHDRAWN"] as const) {
      expect(requestActions({ status, assignee: null }, true)).toEqual({
        edit: false,
        resubmit: false,
        withdraw: false,
      });
    }
    // Enología y contabilidad solo leen.
    expect(requestActions({ status: "CHANGES_REQUESTED", assignee }, false)).toEqual({
      edit: false,
      resubmit: false,
      withdraw: false,
    });
  });

  it("cantidad de una autorización y de una ampliación", () => {
    expect(requestQuantityText({ kind: "INITIAL", quantity: 100, resultingQuota: 100 })).toBe("100 botellas");
    expect(requestQuantityText({ kind: "QUOTA_INCREASE", quantity: 50, resultingQuota: 150 })).toBe(
      "50 botellas más (150 en total)",
    );
    expect(requestQuantityText({ kind: "INITIAL", quantity: 1, resultingQuota: 1 })).toBe("1 botella");
  });

  it("solo las peticiones de cambio sin resolver, y los campos con su nombre", () => {
    const request = tokenizationFixtures.requests.find((r) => r.changeRequests.length > 0)!;
    const open = { ...request.changeRequests[0]!, id: "abierta", resolvedAt: null };
    const resolved = { ...open, id: "resuelta", resolvedAt: "2026-09-20T12:00:00.000Z" };
    expect(pendingChangeRequests({ changeRequests: [resolved, open] }).map((c) => c.id)).toEqual(["abierta"]);
    expect(changeFieldLabel("commercial.tastingNotes")).toBe("Notas de cata");
    expect(changeFieldLabel("otro.campo")).toBe("otro.campo");
  });

  it("el formulario parte de lo que ya tiene la solicitud", () => {
    const request = tokenizationFixtures.requests.find((r) => r.commercialDraft.imageKeys.length > 0)!;
    const form = formFromRequest(request);
    expect(form.name).toBe(request.commercialDraft.name);
    expect(form.images).toHaveLength(request.commercialDraft.imageKeys.length);
    expect(form.images.filter((i) => i.isCover)).toHaveLength(1);
    const again = validateTokenizationForm(form, { commercial: true });
    expect(again.ok && again.value.quantity).toBe(request.quantity);
  });
});

describe("fotos: una sola portada", () => {
  it("la primera es la portada hasta que se elige otra; al quitarla pasa a la siguiente", () => {
    let images = addImage([], "a");
    images = addImage(images, "b");
    expect(images.map((i) => i.isCover)).toEqual([true, false]);
    images = setCover(images, "b");
    expect(images.map((i) => i.isCover)).toEqual([false, true]);
    images = setAlt(images, "a", "Botella sobre la mesa");
    expect(images[0]!.alt).toBe("Botella sobre la mesa");
    images = removeImage(images, "b");
    expect(images).toEqual([{ key: "a", alt: "Botella sobre la mesa", isCover: true }]);
    expect(
      withSingleCover([
        { key: "a", alt: "", isCover: true },
        { key: "b", alt: "", isCover: true },
      ]).map((i) => i.isCover),
    ).toEqual([true, false]);
  });
});

describe("TokenizationRequestForm: forma de lo que se envía", () => {
  it("una autorización válida cumple el esquema del contrato y lleva la confirmación explícita", () => {
    const result = validateTokenizationForm(
      {
        ...valid,
        quantity: "1.500",
        notes: " Primera preventa. ",
        images: [{ key: "org/w/collections/a.png", alt: " Botella ", isCover: false }],
      },
      { commercial: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = toCreateBody(result.value, { commercial: true });
    expect(body).toEqual({
      quantity: 1500,
      commercial: {
        name: "Singani Preventa 2026",
        description: "Singani de altura de la Destilería Cinti Viejo, en preventa.",
        tastingNotes: null,
        pairing: null,
        imageKeys: [{ key: "org/w/collections/a.png", alt: "Botella", isCover: true }],
      },
      notes: "Primera preventa.",
      confirm: true,
    });
    expect(CreateTokenizationRequestSchema.safeParse(body).success).toBe(true);
    const update = toUpdateBody(result.value, { commercial: true });
    expect(update).not.toHaveProperty("confirm");
    expect(UpdateTokenizationRequestSchema.safeParse(update).success).toBe(true);
  });

  it("una ampliación solo lleva la cantidad (la colección ya tiene sus datos)", () => {
    const result = validateTokenizationForm(emptyTokenizationForm({ quantity: "50" }), { commercial: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toCreateBody(result.value, { commercial: false })).toEqual({ quantity: 50, confirm: true });
  });

  it("marca la cantidad, el nombre, la descripción y las fotos sin describir", () => {
    const result = validateTokenizationForm(
      { ...valid, quantity: "12,5", name: "ab", description: "corta", images: [{ key: "k", alt: " ", isCover: true }] },
      { commercial: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["description", "images", "name", "quantity"]);
    const empty = validateTokenizationForm({ ...valid, quantity: "" }, { commercial: true });
    expect(!empty.ok && empty.errors.quantity).toBe("Indica cuántas botellas quieres autorizar.");
    expect(validateTokenizationForm({ ...valid, quantity: "0" }, { commercial: true }).ok).toBe(false);
  });

  it("no decide la cuota: una cantidad mayor que el máximo se envía y la rechaza el servidor", () => {
    const result = validateTokenizationForm({ ...valid, quantity: "3.100" }, { commercial: true });
    expect(result.ok && result.value.quantity).toBe(3100);
  });

  it("lleva los errores por campo del servidor a los campos del formulario", () => {
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Datos no válidos",
      details: [
        { field: "quantity", message: "Debe ser un entero" },
        { field: "commercial.name", message: "Demasiado corto" },
        { field: "commercial.imageKeys.0.alt", message: "Falta la descripción" },
      ],
    });
    expect(tokenizationFieldErrors(error)).toEqual({
      quantity: "Debe ser un entero",
      name: "Demasiado corto",
      images: "Falta la descripción",
    });
  });

  it("texto de la confirmación explícita", () => {
    expect(confirmationText(100, true)).toBe(
      "Se emitirán 100 NFT a nombre de tu bodega en la red Stellar cuando Drinks on Chain apruebe la solicitud.",
    );
    expect(confirmationText(1500, false)).toContain("1.500 NFT");
    expect(confirmationText(1500, false)).toContain("en cuanto envíes la solicitud");
  });
});

describe("cierre con faltante (solo lectura)", () => {
  it("sin faltante, con faltante abierto, decidido y resuelto", () => {
    expect(closureSummary({ status: "NO_SHORTFALL", shortfall: 0, bottles: 2950, minted: 150 })).toBe(
      "Hay botella para cada NFT: 2.950 botellas para 150 NFT emitidos.",
    );
    const open = closureSummary({ status: "SHORTFALL_OPEN", shortfall: 20, bottles: 1040, minted: 1060 });
    expect(open).toContain("20 NFT se quedaron sin botella (1.060 emitidos, 1.040 botellas)");
    expect(open).toContain("Drinks on Chain decide");
    expect(closureSummary({ status: "DECIDED", shortfall: 1, bottles: 99, minted: 100 })).toContain(
      "1 NFT se quedó sin botella",
    );
    expect(closureSummary({ status: "RESOLVED", shortfall: 20, bottles: 80, minted: 100 })).toContain(
      "Quedó resuelto.",
    );
  });
});
