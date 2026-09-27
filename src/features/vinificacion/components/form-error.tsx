import { Alert } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";

/**
 * Error del backend al guardar: el mensaje y, si es un 422, los detalles que no se muestran ya
 * junto a su campo (`fields` son los campos que el formulario marca con `details[].field`).
 */
export function FormErrorAlert({ error, fields = [] }: { error: unknown; fields?: readonly string[] }) {
  if (!error) return null;
  const { formErrors } = fieldErrorsFrom(error, fields);
  return (
    <Alert tone="danger" title={errorMessage(error)}>
      {formErrors.length > 0 && (
        <ul className="m-0 pl-4">
          {formErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
