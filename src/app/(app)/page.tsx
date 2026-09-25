"use client";

import { Card, ErrorState, KeyValueList, SkeletonText } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";

// Pantalla de ejemplo: lee GET /v1/users/me con los tres estados obligatorios.
export default function HomePage() {
  const me = useMe();
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-3xl">Inicio</h1>
      <Card className="max-w-xl p-6">
        {me.isPending ? (
          <SkeletonText lines={4} />
        ) : me.isError ? (
          <ErrorState bare description={errorMessage(me.error)} onRetry={() => me.refetch()} retrying={me.isFetching} />
        ) : (
          <KeyValueList
            items={[
              { term: "Nombre", value: me.data.fullName },
              { term: "Correo", value: me.data.email },
              { term: "Rol", value: me.data.userRole },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
