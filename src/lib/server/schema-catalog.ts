import Database from "better-sqlite3"

import { datasetDbPath } from "@/lib/server/paths"

export type ColumnInfo = {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export type TableInfo = {
  name: string
  columns: ColumnInfo[]
  rowCount: number
  foreignKeys: Array<{
    from: string
    table: string
    to: string
  }>
}

let cachedCatalog: TableInfo[] | null = null

function withDataset<T>(fn: (db: Database.Database) => T) {
  const db = new Database(datasetDbPath, { readonly: true, fileMustExist: true })
  try {
    db.pragma("query_only = ON")
    return fn(db)
  } finally {
    db.close()
  }
}

export function getCatalog() {
  if (cachedCatalog) return cachedCatalog

  cachedCatalog = withDataset((db) => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>

    return tables.map((table) => {
      const columns = db
        .prepare(`PRAGMA table_info(${JSON.stringify(table.name)})`)
        .all() as Array<{
        name: string
        type: string
        notnull: number
        pk: number
      }>

      const foreignKeys = db
        .prepare(`PRAGMA foreign_key_list(${JSON.stringify(table.name)})`)
        .all() as Array<{ from: string; table: string; to: string }>

      const rowCount = (
        db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as {
          count: number
        }
      ).count

      return {
        name: table.name,
        rowCount,
        columns: columns.map((column) => ({
          name: column.name,
          type: column.type,
          notNull: column.notnull === 1,
          primaryKey: column.pk > 0,
        })),
        foreignKeys: foreignKeys.map((fk) => ({
          from: fk.from,
          table: fk.table,
          to: fk.to,
        })),
      }
    })
  })

  return cachedCatalog
}

export function schemaSummary() {
  return getCatalog()
    .map((table) => {
      const columns = table.columns
        .map((column) => {
          const pk = column.primaryKey ? " pk" : ""
          return `${column.name}:${column.type || "TEXT"}${pk}`
        })
        .join(", ")
      const fks = table.foreignKeys.length
        ? `; joins ${table.foreignKeys
            .map((fk) => `${fk.from}->${fk.table}.${fk.to}`)
            .join(", ")}`
        : ""
      return `${table.name} (${table.rowCount} rows): ${columns}${fks}`
    })
    .join("\n")
}

export function tableNames() {
  return getCatalog().map((table) => table.name)
}

export function knownColumnNames() {
  return new Set(
    getCatalog().flatMap((table) =>
      table.columns.map((column) => `${table.name}.${column.name}`),
    ),
  )
}

export function dataWindowSummary() {
  return withDataset((db) => {
    const userDates = db
      .prepare(
        "SELECT MIN(created_at) as minCreated, MAX(created_at) as maxCreated, MAX(last_active_at) as maxActive FROM users",
      )
      .get() as { minCreated: string; maxCreated: string; maxActive: string }
    const paymentDates = db
      .prepare("SELECT MIN(created_at) as minPayment, MAX(created_at) as maxPayment FROM payments")
      .get() as { minPayment: string; maxPayment: string }
    return `Data window: users created ${userDates.minCreated} to ${userDates.maxCreated}; latest activity ${userDates.maxActive}; payments ${paymentDates.minPayment} to ${paymentDates.maxPayment}.`
  })
}
