export type ProviderId = "openai" | "gemini"

export type MessageRole = "user" | "assistant" | "system"

export type SqlScalar = string | number | boolean | null

export type ChatPart =
  | { type: "text"; text: string }
  | {
      type: "progress"
      title: string
      steps: Array<{
        label: string
        status: "pending" | "running" | "done" | "error"
      }>
    }
  | { type: "sql"; sql: string }
  | {
      type: "table"
      columns: string[]
      rows: Record<string, SqlScalar>[]
      rowCount: number
      truncated: boolean
      exportId?: string
    }
  | {
      type: "chart"
      chartType: "bar" | "line" | "area" | "pie"
      xKey: string
      yKey: string
      data: Record<string, SqlScalar>[]
    }
  | {
      type: "stats"
      items: Array<{
        label: string
        value: string
        detail?: string
      }>
    }
  | {
      type: "clarification"
      question: string
      options: string[]
      allowFreeText?: boolean
    }
  | { type: "error"; title: string; detail?: string }

export type ChatMessage = {
  id: string
  threadId: string
  role: MessageRole
  parts: ChatPart[]
  status: "ready" | "streaming" | "error" | "interrupted"
  createdAt: string
}

export type Thread = {
  id: string
  title: string
  provider: ProviderId
  model: string
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type ProviderConfig = {
  id: ProviderId
  label: string
  defaultModel: string
  models: string[]
  keyConfigured: boolean
  keyHint: string | null
}

export type ReasoningLevel = "low" | "medium" | "high"

export type AgentModelConfig = {
  provider: ProviderId
  model: string
  reasoning: ReasoningLevel
}

export type AppSettings = {
  defaultProvider: ProviderId
  defaultModel: string
  mainAgent: AgentModelConfig
  workerAgent: AgentModelConfig
  theme: "system" | "light" | "dark"
  businessContext: string
  providers: ProviderConfig[]
}

export type QueryResult = {
  queryId: string
  sql: string
  columns: string[]
  rows: Record<string, SqlScalar>[]
  totalRows: number
  truncated: boolean
  elapsedMs: number
  exportId?: string
}

export type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
  kind: "image" | "pdf" | "csv" | "other"
  sha256: string
  textPreview?: string
  createdAt: string
}

export type BootstrapPayload = {
  settings: AppSettings
  threads: Thread[]
  messagesByThread: Record<string, ChatMessage[]>
  schemaSummary: string
}
