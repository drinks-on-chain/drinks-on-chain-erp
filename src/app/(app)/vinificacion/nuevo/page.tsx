import { Suspense } from "react";
import { Skeleton } from "@drinks-on-chain/ui";
import { NewTankForm } from "./new-tank-form";

// Alta de tanque y decisión de destino (09 §3 filas 4.1 y 4.3; §8 punto 3). Lee `?vendimia=`.
export default function NewTankPage() {
  return (
    <Suspense fallback={<Skeleton shape="block" className="h-96" />}>
      <NewTankForm />
    </Suspense>
  );
}
