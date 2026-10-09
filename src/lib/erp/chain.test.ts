import { describe, expect, it } from "vitest";
import { chainFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { ChainTxRef, TokenCounts, WineryChainAccountView } from "@drinks-on-chain/mocks";
import {
  anchorInProgress,
  anyTxInProgress,
  chainAccountInProgress,
  collectionInProgress,
  fmtXlm,
  lotTokenizationInProgress,
  soldCount,
  txKindLabel,
} from "./chain";

const tx = (status: ChainTxRef["status"]): ChainTxRef => ({
  id: `tx-${status}`,
  kind: "MINT_BATCH",
  status,
  network: "TESTNET",
  txHash: null,
  explorerUrl: null,
  ledger: null,
  confirmedAt: null,
  attempts: 1,
  lastError: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
});

const counts = (over: Partial<TokenCounts> = {}): TokenCounts => ({
  minted: 0,
  available: 0,
  reserved: 0,
  sold: 0,
  redeemable: 0,
  passActive: 0,
  redeemed: 0,
  burned: 0,
  expired: 0,
  ...over,
});

const view = (over: Partial<WineryChainAccountView> = {}): WineryChainAccountView => ({
  identity: {
    wineryId: "w",
    network: "TESTNET",
    status: "ACTIVE",
    account: null,
    contract: null,
    pendingTransactions: [],
    lastError: null,
  },
  totals: counts(),
  byLot: [],
  recentTransactions: [],
  chainCosts: { feesChargedXlm: "0.0000000", since: null },
  ...over,
});

describe("transacciones en curso (refresco cada 5 s, contrato de la Ola 3 §2.4)", () => {
  it("de PENDING a RETRYING siguen en curso; CONFIRMED y FAILED, no", () => {
    for (const s of ["PENDING", "BUILDING", "SUBMITTED", "RETRYING"] as const) {
      expect(anyTxInProgress([tx("CONFIRMED"), tx(s)]), s).toBe(true);
    }
    expect(anyTxInProgress([tx("CONFIRMED"), tx("FAILED")])).toBe(false);
    expect(anyTxInProgress([])).toBe(false);
  });

  it("el anclaje se sigue hasta que su transacción termina", () => {
    expect(anchorInProgress(null)).toBe(false);
    expect(anchorInProgress({ transaction: tx("SUBMITTED") })).toBe(true);
    expect(anchorInProgress({ transaction: tx("CONFIRMED") })).toBe(false);
    expect(anchorInProgress({ transaction: tx("FAILED") })).toBe(false);
  });

  it("la cuenta de la bodega: identidad preparándose, transacciones recientes o anclajes en vuelo", () => {
    expect(chainAccountInProgress(view())).toBe(false);
    expect(chainAccountInProgress(view({ recentTransactions: [tx("CONFIRMED"), tx("FAILED")] }))).toBe(false);
    expect(chainAccountInProgress(view({ recentTransactions: [tx("BUILDING")] }))).toBe(true);
    expect(chainAccountInProgress(view({ identity: { ...view().identity, status: "PROVISIONING" } }))).toBe(true);
    expect(
      chainAccountInProgress(view({ identity: { ...view().identity, pendingTransactions: [tx("PENDING")] } })),
    ).toBe(true);
  });

  it("las cuentas de los fixtures no tienen nada en vuelo", () => {
    const accounts = Object.values(chainFixtures.wineryAccounts);
    expect(accounts.length).toBeGreaterThan(0);
    for (const account of accounts) expect(chainAccountInProgress(account)).toBe(false);
  });

  it("la colección: emisiones, anclaje o quemas del cierre", () => {
    const mint = (status: ChainTxRef["status"]) => ({ transactions: [tx(status)] });
    const base = { mints: [mint("CONFIRMED")], anchor: null, closure: null } as unknown as Parameters<
      typeof collectionInProgress
    >[0];
    expect(collectionInProgress(base)).toBe(false);
    expect(collectionInProgress({ ...base, mints: [mint("CONFIRMED"), mint("SUBMITTED")] as never })).toBe(true);
    expect(collectionInProgress({ ...base, mints: [mint("FAILED")] as never })).toBe(false);
    expect(collectionInProgress({ ...base, anchor: { transaction: tx("PENDING") } as never })).toBe(true);
    expect(collectionInProgress({ ...base, closure: { items: [{ burnTx: tx("RETRYING") }] } as never })).toBe(true);
    expect(collectionInProgress({ ...base, closure: { items: [{ burnTx: null }] } as never })).toBe(false);
  });

  it("el estado del lote: solo con la emisión en cola o en curso", () => {
    const withMint = (mintStatus: string | null) =>
      ({ collection: mintStatus ? { mintStatus } : null }) as Parameters<typeof lotTokenizationInProgress>[0];
    expect(lotTokenizationInProgress(withMint(null))).toBe(false);
    expect(lotTokenizationInProgress(withMint("PENDING"))).toBe(true);
    expect(lotTokenizationInProgress(withMint("IN_PROGRESS"))).toBe(true);
    expect(lotTokenizationInProgress(withMint("CONFIRMED"))).toBe(false);
    expect(lotTokenizationInProgress(withMint("FAILED"))).toBe(false);
  });
});

describe("cifras y textos de la cuenta", () => {
  it("vendidos: los que ya salieron de la bodega, sin los quemados ni los reservados", () => {
    expect(soldCount(counts({ minted: 100, available: 40, reserved: 5, burned: 3 }))).toBe(0);
    expect(soldCount(counts({ sold: 10, redeemable: 20, passActive: 2, redeemed: 7, expired: 1 }))).toBe(40);
  });

  it("XLM sin ceros de relleno y con coma decimal", () => {
    expect(fmtXlm("0.1389000")).toBe("0,1389 XLM");
    expect(fmtXlm("0.0000000")).toBe("0 XLM");
    expect(fmtXlm("12")).toBe("12 XLM");
    expect(fmtXlm("1234.5000000")).toBe("1.234,5 XLM");
  });

  it("un tipo de transacción desconocido se muestra tal cual", () => {
    expect(txKindLabel("MINT_BATCH")).toBe("Emisión de NFT");
    expect(txKindLabel("ALGO_NUEVO")).toBe("ALGO_NUEVO");
  });
});
