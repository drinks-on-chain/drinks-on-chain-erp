import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { chainFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { WineryChainIdentity } from "@drinks-on-chain/mocks";
import { ChainAccountUnavailable, IdentityCard } from "./identity-card";

afterEach(cleanup);

const active = chainFixtures.identities.find((i) => i.status === "ACTIVE" && i.contract?.symbol === "CVJ")!;

const bare = (over: Partial<WineryChainIdentity>): WineryChainIdentity => ({
  wineryId: "w",
  network: "TESTNET",
  status: "NOT_PROVISIONED",
  account: null,
  contract: null,
  pendingTransactions: [],
  lastError: null,
  ...over,
});

describe("IdentityCard (1F, contrato de la Ola 3 §3.4)", () => {
  it("identidad activa: cuenta y contrato con los enlaces al explorador que da el backend", () => {
    render(<IdentityCard identity={active} />);
    const card = screen.getByRole("group", { name: "Identidad en la red" });
    expect(card).toHaveAttribute("data-identity", "ACTIVE");
    expect(card).toHaveTextContent(active.account!.address);
    expect(screen.getByRole("link", { name: /Ver la cuenta en el explorador/ })).toHaveAttribute(
      "href",
      active.account!.explorerUrl!,
    );
    expect(screen.getByRole("link", { name: /Ver el contrato en el explorador/ })).toHaveAttribute(
      "href",
      active.contract!.explorerUrl!,
    );
    expect(card).toHaveTextContent("CVJ");
  });

  it("sin cuenta: lo dice sin afirmar que exista y no enlaza a ningún sitio", () => {
    render(<IdentityCard identity={bare({})} />);
    expect(screen.getByText("Tu bodega aún no tiene cuenta en la red")).toBeInTheDocument();
    expect(screen.getByText("Sin cuenta en la red")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("preparándose: avisa y muestra las operaciones en curso con su estado", () => {
    const tx = { ...active.account!.createdTx, status: "SUBMITTED" as const, confirmedAt: null };
    render(<IdentityCard identity={bare({ status: "PROVISIONING", pendingTransactions: [tx] })} />);
    expect(screen.getByText("Preparando tu cuenta en la red")).toBeInTheDocument();
    const pending = screen.getByRole("list", { name: "Operaciones en curso" });
    expect(pending).toHaveTextContent("Creación de la cuenta");
    expect(pending).toHaveTextContent("Enviada a la red");
  });

  it("sin explorerUrl del backend no se inventa el enlace", () => {
    const identity: WineryChainIdentity = {
      ...active,
      account: { ...active.account!, explorerUrl: null },
      contract: { ...active.contract!, explorerUrl: null },
    };
    render(<IdentityCard identity={identity} />);
    expect(screen.queryByRole("link", { name: /Ver la cuenta en el explorador/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver el contrato en el explorador/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Identidad en la red" })).toHaveTextContent(active.account!.address);
  });

  it("fallo y pausa: se explican y quién tiene que actuar", () => {
    const { rerender } = render(
      <IdentityCard
        identity={bare({
          status: "FAILED",
          lastError: { code: "CHN_INSUFFICIENT_BALANCE", message: "Saldo insuficiente." },
        })}
      />,
    );
    expect(screen.getByText("No se pudo preparar la cuenta en la red")).toBeInTheDocument();
    expect(screen.getByText("CHN_INSUFFICIENT_BALANCE")).toBeInTheDocument();
    rerender(<IdentityCard identity={{ ...active, status: "PAUSED" }} />);
    expect(screen.getByText("El contrato de la bodega está pausado en la red")).toBeInTheDocument();
  });

  it("backend sin la ruta todavía: se dice sin error ni botón de reintento", () => {
    render(<ChainAccountUnavailable />);
    expect(screen.getByText("Tu bodega todavía no tiene cuenta en la red")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
