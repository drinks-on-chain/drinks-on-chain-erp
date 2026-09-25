import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecisionModal } from "./decision-modal";

function setup(singaniDisabled = false) {
  const onConfirm = vi.fn();
  render(
    <DecisionModal
      open
      onOpenChange={() => {}}
      title="Destino técnico de este lote"
      description="Al elegir, la ruta contraria queda bloqueada."
      options={[
        { value: "WINE_AGING", title: "A crianza", subtitle: "Vino", icon: null },
        {
          value: "SINGANI_DIST",
          title: "A destilación",
          subtitle: "Singani",
          icon: null,
          disabled: singaniDisabled,
          disabledReason: "La D.O. Singani exige Moscatel de Alejandría.",
        },
      ]}
      acknowledgement="Entiendo que el destino no se puede cambiar."
      confirmLabel="Confirmar destino"
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, user: userEvent.setup() };
}

afterEach(cleanup);

describe("DecisionModal", () => {
  it("exige elegir y confirmar de forma explícita", async () => {
    const { onConfirm, user } = setup();
    const confirm = screen.getByRole("button", { name: "Confirmar destino" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /A destilación/ }));
    expect(screen.getByRole("button", { name: /A destilación/ })).toHaveAttribute("aria-pressed", "true");
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("SINGANI_DIST");
  });

  it("explica por qué una opción no está disponible", () => {
    setup(true);
    expect(screen.getByRole("button", { name: /A destilación/ })).toBeDisabled();
    expect(screen.getByText("La D.O. Singani exige Moscatel de Alejandría.")).toBeInTheDocument();
  });
});
