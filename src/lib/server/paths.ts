import fs from "node:fs"
import path from "node:path"

export const projectRoot = process.cwd()
export const datasetDbPath = path.join(projectRoot, "dataset", "nf_buildathon.db")
export const schemaSqlPath = path.join(projectRoot, "dataset", "schema.sql")

export function dataDir() {
  return process.env.NF_QUERYGPT_DATA_DIR ?? path.join(projectRoot, "data")
}

export function appDbPath() {
  return path.join(dataDir(), "app.db")
}

export function uploadsDir() {
  return path.join(dataDir(), "uploads")
}

export function workspacesDir() {
  return path.join(dataDir(), "workspaces")
}

export function masterKeyPath() {
  return path.join(dataDir(), ".master-key")
}

export function ensureDataDirs() {
  for (const dir of [dataDir(), uploadsDir(), workspacesDir()]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
