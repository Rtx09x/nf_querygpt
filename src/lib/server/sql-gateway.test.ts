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
})
