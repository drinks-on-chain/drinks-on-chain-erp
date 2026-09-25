import { Alert } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { detailMessages } from "../form-utils";

/** Error del backend al guardar: mensaje y, si es de validación (400/422), sus detalles. */
export function FormErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const details = error instanceof ApiError && error.isValidation ? detailMessages(error.details) : [];
  return (
    <Alert tone="danger" title={errorMessage(error)}>
      {details.length > 0 && (
        <ul className="m-0 pl-4">
          {details.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
