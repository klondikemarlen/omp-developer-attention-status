import { z } from "../../vendor/zod.js";

const descriptionSourceSchema = z.enum(["explicit", "generated"]);
const descriptionSchema = z.object({
  sessionId: z.string().min(1),
  description: z.string().trim().min(1).max(160),
  source: descriptionSourceSchema,
  recordedAtMs: z.number().finite(),
});
export function parseBillableDescription(value) {
  return descriptionSchema.safeParse(value).data;
}
