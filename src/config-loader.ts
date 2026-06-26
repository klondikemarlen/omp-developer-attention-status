import fs from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import {
  parseDeveloperCostConfig,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
} from "./billing.js"

const PLUGIN_NAME = "omp-developer-cost-status"

type PluginSettingsByName = Record<string, Record<string, unknown>>

type PluginRuntimeConfig = {
  settings?: PluginSettingsByName
}

type ProjectPluginOverrides = {
  settings?: PluginSettingsByName
}

export async function loadDeveloperCostConfig(cwd: string): Promise<DeveloperCostConfig> {
  return loadDeveloperCostConfigFromFiles(
    pluginsLockfilePath(),
    projectPluginOverridesPath(cwd),
  )
}

export async function loadDeveloperCostConfigFromFiles(
  pluginsLockfile: string,
  projectPluginOverrides: string,
): Promise<DeveloperCostConfig> {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readJsonFile<PluginRuntimeConfig>(pluginsLockfile),
    readJsonFile<ProjectPluginOverrides>(projectPluginOverrides),
  ])
  const globalSettings = runtimeConfig?.settings?.[PLUGIN_NAME] ?? {}
  const projectSettings = projectOverrides?.settings?.[PLUGIN_NAME] ?? {}
  const mergedSettings = {
    ...globalSettings,
    ...projectSettings,
  }

  return parseDeveloperCostConfig(mergedSettings as DeveloperCostOptions)
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8")

    return JSON.parse(raw) as T
  } catch (error) {
    if (isEnoent(error)) return undefined

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read developer cost config at ${filePath}: ${message}`)
  }
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}


function pluginsLockfilePath(): string {
  return path.join(homedir(), ".omp", "plugins", "omp-plugins.lock.json")
}

function projectPluginOverridesPath(cwd: string): string {
  return path.join(cwd, ".omp", "plugin-overrides.json")
}
