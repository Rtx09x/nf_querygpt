import Database from "better-sqlite3"
import { Parser } from "node-sql-parser"
import { randomUUID } from "node:crypto"

import { QueryResult, SqlScalar } from "@/lib/querygpt/types"
import { saveExport } from "@/lib/server/app-db"
import { datasetDbPath } from "@/lib/server/paths"
import { tableNames } from "@/lib/server/schema-catalog"

const bannedPattern =
  /\b(insert|update|delete|drop|alter|create|replace|truncate|pragma|attach|detach|vacuum|reindex|begin|commit|rollback|savepoint|release|load_extension)\b/i
const relationPattern = /\b(from|join)\s+["'`]?([a-zA-Z_][\w]*)["'`]?/gi
const parser = new Parser()

function normalizeSql(sql: string) {
  return sql.trim().replace(/;\s*$/, "")
}

function assertReadOnly(sql: string) {
  const normalized = normalizeSql(sql)
  if (!normalized) throw new Error("SQL is empty.")
  if (normalized.length > 10_000) {
    throw new Error("SQL is too long. Keep it under 10,000 characters.")
  }

  const statements = normalized
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
  if (statements.length !== 1) {
    throw new Error("Only one SQL statement is allowed.")
  }

  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Only SELECT or WITH queries are allowed.")
  }
  if (bannedPattern.test(normalized)) {
    throw new Error("Mutation, DDL, PRAGMA, ATTACH, and transaction commands are blocked.")
  }

  try {
    const ast = parser.astify(normalized, { database: "sqlite" }) as
      | { type?: string }
      | Array<{ type?: string }>
    const roots = Array.isArray(ast) ? ast : [ast]
    if (!roots.every((root) => root.type === "select")) {
      throw new Error("Only SELECT statements are accepted.")
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Only SELECT")) {
      throw error
    }
    throw new Error("SQL parser rejected the query. Use standard SQLite SELECT syntax.")
  }

  const allowedTables = new Set(tableNames())
  let match: RegExpExecArray | null
  while ((match = relationPattern.exec(normalized))) {
    const table = match[2]
    if (!allowedTables.has(table) && !table.startsWith("upload_")) {
      throw new Error(`Table "${table}" is not in the allowed database catalog.`)
    }
  }

  return normalized
}

function wrapWithLimit(sql: string, visibleLimit: number) {
  return `SELECT * FROM (${sql}) AS querygpt_result LIMIT ${visibleLimit + 1}`
}

function scalar(value: unknown): SqlScalar {
  if (value === null || typeof value === "string" || typeof value === "number") {
    return value
  }
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "boolean") return value
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toCsv(columns: string[], rows: Record<string, SqlScalar>[]) {
  const escape = (value: SqlScalar) => {
    if (value === null) return ""
    const text = String(value)
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  return [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n")
}

export function runReadonlyQuery(input: {
  sql: string
  visibleLimit?: number
  exportLimit?: number
}): QueryResult {
  const start = performance.now()
  const sql = assertReadOnly(input.sql)
  const visibleLimit = Math.min(Math.max(input.visibleLimit ?? 200, 1), 500)
  const exportLimit = Math.min(Math.max(input.exportLimit ?? 10_000, visibleLimit), 10_000)

  const db = new Database(datasetDbPath, { readonly: true, fileMustExist: true })
  try {
    db.pragma("query_only = ON")
    db.pragma("foreign_keys = ON")

    const visibleRowsRaw = db.prepare(wrapWithLimit(sql, visibleLimit)).all() as Record<
      string,
      unknown
    >[]
    const truncated = visibleRowsRaw.length > visibleLimit
    const visibleRows = visibleRowsRaw.slice(0, visibleLimit).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, scalar(value)]),
      ) as Record<string, SqlScalar>,
    )
    const columns = visibleRowsRaw[0] ? Object.keys(visibleRowsRaw[0]) : []

    const exportRowsRaw = truncated
      ? (db.prepare(wrapWithLimit(sql, exportLimit)).all() as Record<string, unknown>[])
      : visibleRowsRaw
    const exportRows = exportRowsRaw.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, scalar(value)]),
      ) as Record<string, SqlScalar>,
    )

    const queryId = randomUUID()
    const exportId = saveExport({
      filename: `nf-querygpt-${queryId}.csv`,
      format: "csv",
      payload: toCsv(columns, exportRows),
    })

    return {
      queryId,
      sql,
      columns,
      rows: visibleRows,
      totalRows: exportRows.length,
      truncated,
      elapsedMs: Math.round(performance.now() - start),
      exportId,
    }
  } finally {
    db.close()
  }
}

export function validateReadonlySql(sql: string) {
  return assertReadOnly(sql)
}
