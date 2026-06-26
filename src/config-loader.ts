import fs from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import {
  parseDeveloperCostConfig,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
} from "./billing.js"

const PLUGIN_NAME = "omp-developer-cost-status"

type FileReader = (filePath: string) => Promise<string>

type ConfigLoaderPaths = {
  homeDirectory?: string
  readFile?: FileReader
}

export class DeveloperCostConfigLoader {
  private readonly homeDirectory: string
  private readonly readFile: FileReader

  constructor(paths: ConfigLoaderPaths = {}) {
    this.homeDirectory = paths.homeDirectory ?? homedir()
    this.readFile = paths.readFile ?? ((filePath) => fs.promises.readFile(filePath, "utf8"))
  }

  async load(cwd: string): Promise<DeveloperCostConfig> {
    return this.loadFromFiles(
      this.pluginsLockfilePath(),
      this.projectPluginOverridesPath(cwd),
    )
  }

  async loadFromFiles(
    pluginsLockfile: string,
    projectPluginOverrides: string,
  ): Promise<DeveloperCostConfig> {
    const [runtimeConfig, projectOverrides] = await Promise.all([
      this.readJsonFile<PluginRuntimeConfig>(pluginsLockfile),
      this.readJsonFile<ProjectPluginOverrides>(projectPluginOverrides),
    ])
    const globalSettings = runtimeConfig?.settings?.[PLUGIN_NAME] ?? {}
    const projectSettings = projectOverrides?.settings?.[PLUGIN_NAME] ?? {}
    const mergedSettings = {
      ...globalSettings,
      ...projectSettings,
    }

    return parseDeveloperCostConfig(mergedSettings as DeveloperCostOptions)
  }

  private async readJsonFile<T>(filePath: string): Promise<T | undefined> {
    try {
      const raw = await this.readFile(filePath)

      return JSON.parse(raw) as T
    } catch (error) {
      if (isEnoent(error)) return undefined

      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Unable to read developer cost config at ${filePath}: ${message}`)
    }
  }

  private pluginsLockfilePath(): string {
    return path.join(this.homeDirectory, ".omp", "plugins", "omp-plugins.lock.json")
  }

  private projectPluginOverridesPath(cwd: string): string {
    return path.join(cwd, ".omp", "plugin-overrides.json")
  }
}

type PluginSettingsByName = Record<string, Record<string, unknown>>

type PluginRuntimeConfig = {
  settings?: PluginSettingsByName
}

type ProjectPluginOverrides = {
  settings?: PluginSettingsByName
}

export const developerCostConfigLoader = new DeveloperCostConfigLoader()

export async function loadDeveloperCostConfig(cwd: string): Promise<DeveloperCostConfig> {
  return developerCostConfigLoader.load(cwd)
}

export async function loadDeveloperCostConfigFromFiles(
  pluginsLockfile: string,
  projectPluginOverrides: string,
): Promise<DeveloperCostConfig> {
  return developerCostConfigLoader.loadFromFiles(
    pluginsLockfile,
    projectPluginOverrides,
  )
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
