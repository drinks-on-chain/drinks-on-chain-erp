import { Suspense } from "react";
import { Skeleton } from "@drinks-on-chain/ui";
import { NewDistillationForm } from "./new-distillation-form";

// Alta de destilación con los cortes del alambique (09 §3 fila 5.1B). Lee `?tanque=`.
export default function NewDistillationPage() {
  return (
    <Suspense fallback={<Skeleton shape="block" className="h-96" />}>
      <NewDistillationForm />
    </Suspense>
  );
}
