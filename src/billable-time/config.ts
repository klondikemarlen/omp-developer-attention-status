import { positiveRateSchema } from "@/billable-time/domain/rate.js"
import { normalizeBillableRepository } from "@/billable-time/domain/repository.js"
import { z } from "@/vendor/zod.js"

const clientSchema = z.object({
  label: z.string().trim().min(1),
  attentionRatePerHour: positiveRateSchema,
  aiRatePerHour: positiveRateSchema,
})
const projectNameSchema = z.string().trim().min(1)
const categorySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
})
const settingsSchema = z.object({
  clients: z.record(z.string(), clientSchema),
  defaultClient: z.string().trim().min(1).optional(),
  projects: z.record(z.string(), projectNameSchema).optional(),
  categories: z.record(z.string(), categorySchema).optional(),
  repositories: z.record(z.string(), z.string().trim().min(1)).optional(),
})

export type BillableClient = z.infer<typeof clientSchema> & { id: string }
export type BillableCategory = z.infer<typeof categorySchema>
export type BillableTimeConfig = {
  clientsByRepository: ReadonlyMap<string, BillableClient>
  defaultClient?: BillableClient
  projectNamesByRepository: ReadonlyMap<string, string>
  categoriesByRepository: ReadonlyMap<string, BillableCategory>
}

export function parseBillableTimeConfig(value: unknown): BillableTimeConfig {
  const settings = parseSettings(value)
  if (settings === undefined) {
    return {
      clientsByRepository: new Map(),
      projectNamesByRepository: new Map(),
      categoriesByRepository: new Map(),
    }
  }

  const clients = new Map<string, BillableClient>()
  for (const [id, client] of Object.entries(settings.clients)) {
    clients.set(id, { id, ...client })
  }

  const clientsByRepository = new Map<string, BillableClient>()
  for (const [repository, clientId] of Object.entries(settings.repositories ?? {})) {
    clientsByRepository.set(
      normalizeBillableRepository(repository),
      clientFor(clientId, clients),
    )
  }

  const projectNamesByRepository = new Map<string, string>()
  for (const [repository, projectName] of Object.entries(settings.projects ?? {})) {
    projectNamesByRepository.set(normalizeBillableRepository(repository), projectName)
  }

  const categoriesByRepository = new Map<string, BillableCategory>()
  for (const [repository, category] of Object.entries(settings.categories ?? {})) {
    categoriesByRepository.set(normalizeBillableRepository(repository), category)
  }

  return {
    clientsByRepository,
    defaultClient: settings.defaultClient === undefined
      ? undefined
      : clientFor(settings.defaultClient, clients),
    projectNamesByRepository,
    categoriesByRepository,
  }
}

function clientFor(clientId: string, clients: ReadonlyMap<string, BillableClient>): BillableClient {
  const client = clients.get(clientId)
  if (client === undefined) throw new Error(`Unknown billable client: ${clientId}.`)
  return client
}

function parseSettings(value: unknown): z.infer<typeof settingsSchema> | undefined {
  if (value === undefined || value === "{}") return undefined
  const parsedValue = typeof value === "string" ? JSON.parse(value) : value
  return settingsSchema.parse(parsedValue)
}


export default parseBillableTimeConfig
