import { Suspense } from "react";
import { Skeleton } from "@drinks-on-chain/ui";
import { NewAgingForm } from "./new-aging-form";

// Alta de crianza (09 §3 fila 5.1A). Lee `?tanque=`.
export default function NewAgingPage() {
  return (
    <Suspense fallback={<Skeleton shape="block" className="h-96" />}>
      <NewAgingForm />
    </Suspense>
  );
}
