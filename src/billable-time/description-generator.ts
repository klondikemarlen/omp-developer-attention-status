import type { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import { descriptionInputFromSession } from "@/billable-time/domain/description-context.js"
import type { BillableDescription } from "@/billable-time/domain/description.js"

export type BillableDescriptionContext = {
  modelRegistry?: Parameters<typeof generateSessionTitle>[1]
  settings?: Parameters<typeof generateSessionTitle>[2]
  sessionId: string
  generateTitle?: (input: string) => Promise<string | null>
  model?: Parameters<typeof generateSessionTitle>[4]
}

type SessionHeader = {
  title?: unknown
  titleSource?: unknown
}

type SessionEntry = Parameters<typeof descriptionInputFromSession>[0][number]

export async function describeBillableSession(
  header: SessionHeader | null,
  entries: readonly SessionEntry[],
  context: BillableDescriptionContext,
  currentSummary?: unknown,
): Promise<Omit<BillableDescription, "sessionId" | "recordedAtMs">> {
  const explicitDescription = explicitTitle(header)
  if (explicitDescription !== undefined) return { description: explicitDescription, source: "explicit" }

  const input = descriptionInputFromSession(entries, currentSummary)
  const generatedDescription = await generateDescription(input, context)

  return { description: generatedDescription, source: "generated" }
}

function explicitTitle(header: SessionHeader | null): string | undefined {
  if (header?.titleSource !== "user") return undefined

  return normalizeDescription(header.title)
}

async function generateDescription(input: string, context: BillableDescriptionContext): Promise<string> {
  if (input === "") return "Unlabeled billable work"

  const generateTitle = context.generateTitle ?? await titleGenerator(context)
  if (generateTitle === undefined) return "Unlabeled billable work"

  return normalizeDescription(await generateTitle(input)) ?? "Unlabeled billable work"
}

async function titleGenerator(
  context: BillableDescriptionContext,
): Promise<((input: string) => Promise<string | null>) | undefined> {
  if (context.modelRegistry === undefined || context.settings === undefined) return undefined

  const { generateSessionTitle } = await import("@oh-my-pi/pi-coding-agent/utils/title-generator")
  return async (input) => generateSessionTitle(
    input,
    context.modelRegistry,
    context.settings,
    context.sessionId,
    context.model,
  )
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const description = value.replace(/\s+/g, " ").trim().slice(0, 160)
  return description === "" ? undefined : description
}
