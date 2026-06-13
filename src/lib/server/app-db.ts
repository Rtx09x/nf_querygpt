import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"

import {
  Attachment,
  AppSettings,
  ChatMessage,
  ProviderConfig,
  ProviderId,
  Thread,
} from "@/lib/querygpt/types"
import { appDbPath, ensureDataDirs } from "@/lib/server/paths"

let appDb: Database.Database | null = null

const providerCatalog: Record<ProviderId, Omit<ProviderConfig, "keyConfigured" | "keyHint">> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5.4-mini",
    models: ["gpt-5.4-mini", "gpt-5.5", "gpt-5.4"],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-pro"],
  },
}

const defaultBusinessContext =
  "NikahForever is a matrimonial platform. Answer operational questions about users, profiles, partner preferences, subscriptions, payments, interests, matches, messages, profile views, reports, and support tickets. Prefer precise database-backed answers over general advice."

function nowIso() {
  return new Date().toISOString()
}

function bool(value: unknown) {
  return value === 1 || value === true
}

function migrate(db: Database.Database) {
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      provider TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      key_hint TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      parts_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS messages_thread_created_idx
      ON messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      local_path TEXT NOT NULL,
      text_preview TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      steps INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS query_exports (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      format TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `)
}

export function getAppDb() {
  if (!appDb) {
    ensureDataDirs()
    appDb = new Database(appDbPath())
    migrate(appDb)
  }
  return appDb
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = getAppDb()
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value_json) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown) {
  getAppDb()
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), nowIso())
}

export function listProviderConfigs(): ProviderConfig[] {
  const rows = getAppDb()
    .prepare("SELECT provider, key_hint FROM credentials")
    .all() as Array<{ provider: ProviderId; key_hint: string | null }>
  const keyHints = new Map(rows.map((row) => [row.provider, row.key_hint]))
  const envHints = new Map<ProviderId, string>()
  if (process.env.OPENAI_API_KEY) envHints.set("openai", "env")
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    envHints.set("gemini", "env")
  }

  return (Object.keys(providerCatalog) as ProviderId[]).map((id) => ({
    ...providerCatalog[id],
    keyConfigured: keyHints.has(id) || envHints.has(id),
    keyHint: keyHints.get(id) ?? envHints.get(id) ?? null,
  }))
}

export function getAppSettings(): AppSettings {
  const defaultProvider = getSetting<ProviderId>("defaultProvider", "openai")
  const defaultModel = getSetting<string>(
    "defaultModel",
    providerCatalog[defaultProvider].defaultModel,
  )
  const mainAgent = getSetting<AppSettings["mainAgent"]>("mainAgent", {
    provider: "openai",
    model: "gpt-5.5",
    reasoning: "high",
  })
  const workerAgent = getSetting<AppSettings["workerAgent"]>("workerAgent", {
    provider: "gemini",
    model: "gemini-3.5-flash",
    reasoning: "medium",
  })
  return {
    defaultProvider,
    defaultModel,
    mainAgent,
    workerAgent,
    theme: getSetting("theme", "system"),
    businessContext: getSetting("businessContext", defaultBusinessContext),
    providers: listProviderConfigs(),
  }
}

export function updateSettings(input: Partial<AppSettings>) {
  if (input.defaultProvider) setSetting("defaultProvider", input.defaultProvider)
  if (input.defaultModel) setSetting("defaultModel", input.defaultModel)
  if (input.mainAgent) setSetting("mainAgent", input.mainAgent)
  if (input.workerAgent) setSetting("workerAgent", input.workerAgent)
  if (input.theme) setSetting("theme", input.theme)
  if (typeof input.businessContext === "string") {
    setSetting("businessContext", input.businessContext)
  }
  return getAppSettings()
}

export function storeEncryptedCredential(input: {
  provider: ProviderId
  ciphertext: string
  iv: string
  authTag: string
  keyHint: string
}) {
  getAppDb()
    .prepare(
      `INSERT INTO credentials (provider, ciphertext, iv, auth_tag, key_hint, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         key_hint = excluded.key_hint,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.provider,
      input.ciphertext,
      input.iv,
      input.authTag,
      input.keyHint,
      nowIso(),
    )
}

export function deleteCredential(provider: ProviderId) {
  getAppDb().prepare("DELETE FROM credentials WHERE provider = ?").run(provider)
}

export function getEncryptedCredential(provider: ProviderId) {
  return getAppDb()
    .prepare(
      "SELECT provider, ciphertext, iv, auth_tag as authTag, key_hint as keyHint FROM credentials WHERE provider = ?",
    )
    .get(provider) as
    | {
        provider: ProviderId
        ciphertext: string
        iv: string
        authTag: string
        keyHint: string | null
      }
    | undefined
}

export function listThreads(): Thread[] {
  const rows = getAppDb()
    .prepare(
      `SELECT id, title, provider, model, pinned, archived, created_at as createdAt, updated_at as updatedAt
       FROM threads
       WHERE archived = 0
       ORDER BY pinned DESC, updated_at DESC`,
    )
    .all() as Array<Omit<Thread, "pinned" | "archived"> & { pinned: number; archived: number }>
  return rows.map((row) => ({
    ...row,
    pinned: bool(row.pinned),
    archived: bool(row.archived),
  }))
}

export function createThread(input?: Partial<Pick<Thread, "title" | "provider" | "model">>) {
  const settings = getAppSettings()
  const thread: Thread = {
    id: randomUUID(),
    title: input?.title ?? "New chat",
    provider: input?.provider ?? settings.defaultProvider,
    model: input?.model ?? settings.defaultModel,
    pinned: false,
    archived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  getAppDb()
    .prepare(
      `INSERT INTO threads (id, title, provider, model, pinned, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      thread.id,
      thread.title,
      thread.provider,
      thread.model,
      0,
      0,
      thread.createdAt,
      thread.updatedAt,
    )
  return thread
}

export function getThread(id: string): Thread | null {
  const row = getAppDb()
    .prepare(
      `SELECT id, title, provider, model, pinned, archived, created_at as createdAt, updated_at as updatedAt
       FROM threads WHERE id = ?`,
    )
    .get(id) as
    | (Omit<Thread, "pinned" | "archived"> & { pinned: number; archived: number })
    | undefined
  if (!row) return null
  return { ...row, pinned: bool(row.pinned), archived: bool(row.archived) }
}

export function updateThread(
  id: string,
  input: Partial<Pick<Thread, "title" | "provider" | "model" | "pinned" | "archived">>,
) {
  const existing = getThread(id)
  if (!existing) return null
  const next = {
    ...existing,
    ...input,
    updatedAt: nowIso(),
  }
  getAppDb()
    .prepare(
      `UPDATE threads
       SET title = ?, provider = ?, model = ?, pinned = ?, archived = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.title,
      next.provider,
      next.model,
      next.pinned ? 1 : 0,
      next.archived ? 1 : 0,
      next.updatedAt,
      id,
    )
  return next
}

export function deleteThread(id: string) {
  getAppDb().prepare("DELETE FROM threads WHERE id = ?").run(id)
}

export function listMessages(threadId: string): ChatMessage[] {
  const rows = getAppDb()
    .prepare(
      `SELECT id, thread_id as threadId, role, parts_json as partsJson, status, created_at as createdAt
       FROM messages WHERE thread_id = ? ORDER BY created_at ASC`,
    )
    .all(threadId) as Array<{
    id: string
    threadId: string
    role: ChatMessage["role"]
    partsJson: string
    status: ChatMessage["status"]
    createdAt: string
  }>

  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    parts: JSON.parse(row.partsJson),
    status: row.status,
    createdAt: row.createdAt,
  }))
}

export function addMessage(
  threadId: string,
  role: ChatMessage["role"],
  parts: ChatMessage["parts"],
  status: ChatMessage["status"] = "ready",
) {
  const message: ChatMessage = {
    id: randomUUID(),
    threadId,
    role,
    parts,
    status,
    createdAt: nowIso(),
  }
  const db = getAppDb()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, parts_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      message.threadId,
      message.role,
      JSON.stringify(message.parts),
      message.status,
      message.createdAt,
    )
    db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(
      message.createdAt,
      threadId,
    )
  })
  tx()
  return message
}

export function saveExport(input: {
  filename: string
  format: "csv" | "json"
  payload: unknown
  ttlMinutes?: number
}) {
  const id = randomUUID()
  const createdAt = nowIso()
  const expiresAt = new Date(
    Date.now() + (input.ttlMinutes ?? 30) * 60 * 1000,
  ).toISOString()
  getAppDb()
    .prepare(
      `INSERT INTO query_exports (id, filename, format, payload_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.filename,
      input.format,
      JSON.stringify(input.payload),
      createdAt,
      expiresAt,
    )
  return id
}

export function getExport(id: string) {
  const row = getAppDb()
    .prepare(
      "SELECT id, filename, format, payload_json as payloadJson, expires_at as expiresAt FROM query_exports WHERE id = ?",
    )
    .get(id) as
    | {
        id: string
        filename: string
        format: "csv" | "json"
        payloadJson: string
        expiresAt: string
      }
    | undefined
  if (!row || Date.parse(row.expiresAt) < Date.now()) return null
  return {
    id: row.id,
    filename: row.filename,
    format: row.format,
    payload: JSON.parse(row.payloadJson),
  }
}

export function addAttachment(input: Omit<Attachment, "createdAt"> & { localPath: string }) {
  const createdAt = nowIso()
  getAppDb()
    .prepare(
      `INSERT INTO attachments
       (id, filename, mime_type, size, kind, sha256, local_path, text_preview, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.filename,
      input.mimeType,
      input.size,
      input.kind,
      input.sha256,
      input.localPath,
      input.textPreview ?? null,
      createdAt,
    )
  return { ...input, createdAt } satisfies Attachment & { localPath: string }
}

export function getAttachment(id: string) {
  const row = getAppDb()
    .prepare(
      `SELECT id, filename, mime_type as mimeType, size, kind, sha256,
              local_path as localPath, text_preview as textPreview, created_at as createdAt
       FROM attachments WHERE id = ?`,
    )
    .get(id) as
    | (Attachment & { localPath: string })
    | undefined
  return row ?? null
}

export function listAttachments(ids: string[]) {
  if (!ids.length) return []
  return ids
    .map((id) => getAttachment(id))
    .filter((attachment): attachment is Attachment & { localPath: string } => Boolean(attachment))
}

export function createRun(input: {
  threadId: string
  provider: ProviderId
  model: string
}) {
  const id = randomUUID()
  getAppDb()
    .prepare(
      `INSERT INTO runs (id, thread_id, provider, model, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.threadId, input.provider, input.model, "running", nowIso())
  return id
}

export function finishRun(
  id: string,
  input: { status: "success" | "error"; steps: number; latencyMs: number; error?: string },
) {
  getAppDb()
    .prepare(
      `UPDATE runs
       SET status = ?, steps = ?, latency_ms = ?, error = ?, finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.steps,
      input.latencyMs,
      input.error ?? null,
      nowIso(),
      id,
    )
}
