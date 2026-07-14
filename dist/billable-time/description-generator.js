import { descriptionInputFromSession } from "../billable-time/domain/description-context.js";

export async function describeBillableSession(
  header,
  entries,
  context,
  currentSummary,
) {
  const explicitDescription = explicitTitle(header);
  if (explicitDescription !== undefined)
    return { description: explicitDescription, source: "explicit" };
  const input = descriptionInputFromSession(entries, currentSummary);
  const generatedDescription = await generateDescription(input, context);
  return { description: generatedDescription, source: "generated" };
}

function explicitTitle(header) {
  if (header?.titleSource !== "user") return undefined;
  return normalizeDescription(header.title);
}

async function generateDescription(input, context) {
  if (input === "") return "Unlabeled billable work";
  const generateTitle =
    context.generateTitle ?? (await titleGenerator(context));
  if (generateTitle === undefined) return "Unlabeled billable work";
  return (
    normalizeDescription(await generateTitle(input)) ??
    "Unlabeled billable work"
  );
}

async function titleGenerator(context) {
  if (context.modelRegistry === undefined || context.settings === undefined)
    return undefined;
  const { generateSessionTitle } =
    await import("@oh-my-pi/pi-coding-agent/utils/title-generator");
  return async (input) =>
    generateSessionTitle(
      input,
      context.modelRegistry,
      context.settings,
      context.sessionId,
      context.model,
    );
}

function normalizeDescription(value) {
  if (typeof value !== "string") return undefined;
  const description = value.replace(/\s+/g, " ").trim().slice(0, 160);
  return description === "" ? undefined : description;
}
