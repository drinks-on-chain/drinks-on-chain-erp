import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewPasswordFields } from "./new-password-fields";

function Harness() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <NewPasswordFields
      password={password}
      confirm={confirm}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      errors={{ confirm: confirm && confirm !== password ? "Las contraseñas no coinciden." : undefined }}
    />
  );
}

describe("NewPasswordFields", () => {
  afterEach(cleanup);

  it("muestra los requisitos asociados al campo y los marca al cumplirse", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const password = screen.getByLabelText(/^Contraseña nueva/);
    const rules = screen.getByRole("list", { name: "Requisitos de la contraseña" });
    expect(password.getAttribute("aria-describedby")).toContain(rules.id);
    expect(within(rules).getAllByText(/\(pendiente\)/)).toHaveLength(3);

    await user.type(password, "vendimia-2026");
    await user.type(screen.getByLabelText(/^Repite la contraseña/), "vendimia-2026");
    expect(within(rules).getAllByText(/\(cumplido\)/)).toHaveLength(3);
  });

  it("enseña el error de la confirmación junto a su campo", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText(/^Contraseña nueva/), "vendimia-2026");
    const confirm = screen.getByLabelText(/^Repite la contraseña/);
    await user.type(confirm, "otra");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
  });
});
