"use client";

import { useRouter } from "next/navigation";
import type { MeResponse } from "@/lib/auth/schemas";
import { Select, toast } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useSwitchOrganization } from "@/lib/auth/hooks";
import { usableMemberships } from "@/lib/auth/organization";
import { es } from "@/lib/i18n/es";

const roleLabel = (role: string) => es.roles[role] ?? role;

/**
 * Selector de la organización activa para la cabecera del shell. Solo aparece con más de una
 * membresía utilizable. Al cambiar, se vacía la caché de consultas y se vuelve al inicio (lo
 * que se estaba viendo puede no existir en la otra organización).
 */
export function OrganizationSwitcher({ me }: { me: MeResponse }) {
  const router = useRouter();
  const switchOrg = useSwitchOrganization();
  const options = usableMemberships(me);
  if (options.length < 2) return null;

  async function change(organizationId: string) {
    if (organizationId === me.activeOrganizationId) return;
    const target = options.find((m) => m.organizationId === organizationId);
    try {
      await switchOrg.mutateAsync(organizationId);
      if (target) toast({ title: es.organization.switched(target.organizationName), tone: "success" });
      router.replace("/");
    } catch (e) {
      toast({ title: errorMessage(e), tone: "danger" });
    }
  }

  return (
    <Select
      size="sm"
      aria-label={es.organization.label}
      className="w-56 max-w-[45vw]"
      value={me.activeOrganizationId ?? undefined}
      placeholder={es.organization.none}
      onValueChange={(id) => void change(id)}
      disabled={switchOrg.isPending}
      options={options.map((m) => ({
        value: m.organizationId,
        label: `${m.organizationName} · ${roleLabel(m.role)}`,
      }))}
    />
  );
}
