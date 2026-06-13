import { describe, expect, it } from "vitest"

import { runReadonlyQuery, validateReadonlySql } from "@/lib/server/sql-gateway"

describe("sql gateway", () => {
  it("allows one read-only select", () => {
    expect(validateReadonlySql("SELECT COUNT(*) AS users FROM users")).toContain(
      "COUNT",
    )
  })

  it("rejects mutation statements", () => {
    expect(() => validateReadonlySql("UPDATE users SET full_name = 'x'")).toThrow(
      /Only SELECT|blocked/,
    )
  })

  it("rejects attach and pragma", () => {
    expect(() => validateReadonlySql("PRAGMA table_info(users)")).toThrow()
    expect(() => validateReadonlySql("ATTACH DATABASE 'x' AS evil")).toThrow()
  })

  it("executes against the supplied dataset in read-only mode", () => {
    const result = runReadonlyQuery({
      sql: "SELECT COUNT(*) AS users FROM users",
    })
    expect(result.rows[0].users).toBe(2000)
    expect(result.sql).toBe("SELECT COUNT(*) AS users FROM users")
  })

  it("preserves column names when a valid query returns no rows", () => {
    const result = runReadonlyQuery({
      sql: "SELECT user_id, full_name FROM users WHERE user_id = -1",
    })
    expect(result.columns).toEqual(["user_id", "full_name"])
    expect(result.rows).toEqual([])
    expect(result.totalRows).toBe(0)
  })

  it("allows safe CTE aliases while still validating real source tables", () => {
    const result = runReadonlyQuery({
      sql: "WITH recent AS (SELECT user_id FROM users LIMIT 3) SELECT COUNT(*) AS rows_seen FROM recent",
    })
    expect(result.rows[0].rows_seen).toBe(3)
  })
})
