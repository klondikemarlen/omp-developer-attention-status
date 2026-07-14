import { chmod, lstat, mkdir, rename } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const ompDataRoot = path.join(homedir(), ".omp")
const legacyDataRoot = path.join(ompDataRoot, "developer-attention-status")
const projectTimeDataRoot = path.join(ompDataRoot, "project-time")

export function defaultProjectTimeDataRoot(): string {
  return projectTimeDataRoot
}

export async function prepareProjectTimeDataRoot(rootPath = projectTimeDataRoot): Promise<void> {
  await mkdir(rootPath, { recursive: true, mode: 0o700 })
  await chmod(rootPath, 0o700)
}

export async function migrateProjectTimeDataRoot(
  oldRoot = legacyDataRoot,
  newRoot = projectTimeDataRoot,
  oldSpreadLedgerPath = path.join(path.dirname(oldRoot), "developer-cost-status", "spread-billing.json"),
): Promise<void> {
  const oldRootExists = await exists(oldRoot)
  const newRootExists = await exists(newRoot)
  const oldSpreadLedgerExists = await exists(oldSpreadLedgerPath)
  const newSpreadLedgerPath = path.join(newRoot, "spread-billing.json")

  if (oldRootExists && newRootExists) {
    throw new Error(
      `Project Time data migration stopped because both ${oldRoot} and ${newRoot} exist. Move or archive one directory before restarting OMP.`,
    )
  }
  if (oldSpreadLedgerExists && (
    await exists(newSpreadLedgerPath) || await exists(path.join(oldRoot, "spread-billing.json"))
  )) {
    throw new Error(
      `Project Time data migration stopped because both ${oldSpreadLedgerPath} and ${newSpreadLedgerPath} exist. Move or archive one file before restarting OMP.`,
    )
  }

  if (oldRootExists) await renameRoot(oldRoot, newRoot)
  if (oldSpreadLedgerExists && await exists(newSpreadLedgerPath)) {
    throw new Error(
      `Project Time data migration stopped because both ${oldSpreadLedgerPath} and ${newSpreadLedgerPath} exist. Move or archive one file before restarting OMP.`,
    )
  }
  if (!oldSpreadLedgerExists) return

  await mkdir(newRoot, { recursive: true, mode: 0o700 })
  await renameRoot(oldSpreadLedgerPath, newSpreadLedgerPath)
}

async function renameRoot(oldPath: string, newPath: string): Promise<void> {
  try {
    await rename(oldPath, newPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && await exists(newPath)) return
    throw error
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
