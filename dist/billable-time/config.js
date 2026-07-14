import { positiveRateSchema } from "../billable-time/domain/rate.js";
import { currencyInputSchema } from "../billable-time/domain/currency.js";
import { normalizeBillableRepository } from "../billable-time/domain/repository.js";
import { z } from "../vendor/zod.js";

const clientSchema = z.object({
  label: z.string().trim().min(1),
  currency: currencyInputSchema,
  attentionRatePerHour: positiveRateSchema,
  aiRatePerHour: positiveRateSchema,
});
const settingsSchema = z.object({
  clients: z.record(z.string(), clientSchema),
  repositories: z.record(z.string(), z.string().trim().min(1)),
});
export function parseBillableTimeConfig(value) {
  const settings = parseSettings(value);
  if (settings === undefined) return { clientsByRepository: new Map() };
  const clients = new Map();
  for (const [id, client] of Object.entries(settings.clients)) {
    clients.set(id, { id, ...client });
  }
  const clientsByRepository = new Map();
  for (const [repository, clientId] of Object.entries(settings.repositories)) {
    const client = clients.get(clientId);
    if (client === undefined)
      throw new Error(`Unknown billable client: ${clientId}.`);
    clientsByRepository.set(normalizeBillableRepository(repository), client);
  }
  return { clientsByRepository };
}

function parseSettings(value) {
  if (value === undefined || value === "{}") return undefined;
  const parsedValue = typeof value === "string" ? JSON.parse(value) : value;
  return settingsSchema.parse(parsedValue);
}

export default parseBillableTimeConfig;
