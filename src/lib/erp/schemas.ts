import { z } from "zod";
import { DateInputSchema, TraceDashboardSchema as MocksTraceDashboardSchema } from "@drinks-on-chain/mocks";

// Esquemas del ERP donde el backend real (su OpenAPI manda) difiere de los de
// `@drinks-on-chain/mocks`. Cada ajuste dice qué envía el backend; cuando los mocks lo recojan, se
// vuelve a usar su esquema y se borra de aquí.

/**
 * Panel de la bodega (`GET /v1/traceability/dashboard`). El backend envía `pendingPhyto[].intakeDate`
 * como fecha de calendario (`2026-03-12`, `PendingPhytoDto`) y `fermentationAlerts[].lastReadingAt`
 * como texto sin formato; los mocks 0.5.0-rc.2 exigen un instante ISO en ambos.
 */
export const TraceDashboardSchema = MocksTraceDashboardSchema.extend({
  pendingPhyto: z.array(MocksTraceDashboardSchema.shape.pendingPhyto.element.extend({ intakeDate: DateInputSchema })),
  fermentationAlerts: z.array(
    MocksTraceDashboardSchema.shape.fermentationAlerts.element.extend({ lastReadingAt: z.string().nullable() }),
  ),
});
export type TraceDashboard = z.infer<typeof TraceDashboardSchema>;
