import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CountdownLock } from "./countdown-lock";

const props = {
  progress: 90,
  title: "Lote inmovilizado por normativa",
  reason: "Mínimo 180 días de reposo.",
  releaseDate: "2026-10-13T00:00:00Z",
  startDate: "2026-04-16T00:00:00Z",
  action: { label: "Pasar a embotellado", href: "/envasado/nuevo?destilacion=p1" },
};

afterEach(cleanup);

describe("CountdownLock", () => {
  it("bloquea la acción mientras quedan días", () => {
    render(<CountdownLock {...props} daysRemaining={18} />);
    expect(screen.getByTestId("countdown-days")).toHaveTextContent("18días");
    expect(screen.getByRole("button", { name: "Pasar a embotellado" })).toBeDisabled();
    expect(screen.getByText("Se libera el 13 oct 2026.")).toBeInTheDocument();
  });

  it("habilita el enlace cuando llega a cero", () => {
    render(<CountdownLock {...props} daysRemaining={0} progress={100} />);
    expect(screen.getByText("Candado liberado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pasar a embotellado" })).toHaveAttribute(
      "href",
      "/envasado/nuevo?destilacion=p1",
    );
  });

  it("sustituye la acción por la nota si el lote ya se cerró o si el rol no puede", () => {
    const { rerender } = render(<CountdownLock {...props} daysRemaining={0} closedNote="Ya se embotelló." />);
    expect(screen.getByText("Ya se embotelló.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pasar a embotellado" })).toBeNull();
    rerender(<CountdownLock {...props} daysRemaining={0} hideAction />);
    expect(screen.queryByRole("link", { name: "Pasar a embotellado" })).toBeNull();
  });
});
