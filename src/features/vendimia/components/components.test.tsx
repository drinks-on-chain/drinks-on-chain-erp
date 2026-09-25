import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoBadge } from "@/features/origen/components/do-badge";
import { LAB_TARGETS } from "../lab-targets";
import { BigNumberInput } from "./big-number-input";
import { LabReadingCard } from "./lab-reading-card";

function EditableCard() {
  const [value, setValue] = useState("");
  return <LabReadingCard target={LAB_TARGETS.ph} value={value} onChange={setValue} required />;
}

describe("LabReadingCard", () => {
  it("se pone en ámbar fuera de objetivo y vuelve al entrar en rango", async () => {
    const { container } = render(<EditableCard />);
    const input = screen.getByLabelText(/pH/);
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("Sin lectura")).toBeInTheDocument();

    await userEvent.type(input, "3,9");
    expect(screen.getByText("Sobre el objetivo")).toBeInTheDocument();
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "high");

    await userEvent.clear(input);
    await userEvent.type(input, "3,4");
    expect(screen.getByText("En objetivo")).toBeInTheDocument();
  });

  it("muestra la lectura registrada con el objetivo", () => {
    render(<LabReadingCard target={LAB_TARGETS.brix} value={21.2} />);
    expect(screen.getByText("21,2")).toBeInTheDocument();
    expect(screen.getByText("Objetivo 22–25")).toBeInTheDocument();
    expect(screen.getByText("Bajo el objetivo")).toBeInTheDocument();
  });
});

describe("BigNumberInput", () => {
  it("campo gigante con unidad y teclado decimal", async () => {
    function Scale() {
      const [v, setV] = useState("");
      return <BigNumberInput label="Peso bruto" unit="kg" value={v} onChange={setV} />;
    }
    render(<Scale />);
    const input = screen.getByLabelText("Peso bruto");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("kg")).toBeInTheDocument();
    await userEvent.type(input, "18400");
    expect(input).toHaveValue("18400");
  });
});

describe("DoBadge", () => {
  it("oro si es apto, ámbar con motivo si no, etiqueta Vino para otras cepas", () => {
    const { rerender } = render(<DoBadge varietyName="Moscatel de Alejandría" altitudeMasl={2350} isDoEligible />);
    expect(screen.getByText("Apto para Singani D.O.")).toBeInTheDocument();
    rerender(<DoBadge varietyName="Moscatel de Alejandría" altitudeMasl={1540} isDoEligible={false} />);
    expect(screen.getByText("No apto D.O. · altitud < 1.600 m")).toBeInTheDocument();
    rerender(<DoBadge varietyName="Tannat" altitudeMasl={1860} isDoEligible />);
    expect(screen.getByText("Vino")).toBeInTheDocument();
    rerender(<DoBadge varietyName="Tannat" altitudeMasl={1860} isDoEligible explain />);
    expect(screen.getByText("No apto D.O. · cepa distinta de Moscatel de Alejandría")).toBeInTheDocument();
  });
});
