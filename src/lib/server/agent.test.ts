import { describe, expect, it } from "vitest"

import { deterministicSql } from "@/lib/server/agent"
import { runReadonlyQuery } from "@/lib/server/sql-gateway"

const evalPrompts = [
  {
    prompt: "How many active users are in Delhi?",
    columns: ["city", "active_users"],
    minRows: 1,
  },
  {
    prompt: "Which plan generated the most revenue?",
    columns: ["plan_name", "revenue_inr"],
    minRows: 1,
  },
  {
    prompt: "Show payment method breakdown",
    columns: ["method", "revenue_inr"],
    minRows: 1,
  },
  {
    prompt: "Show the interest to match funnel",
    columns: ["stage", "metric_value"],
    minRows: 5,
  },
  {
    prompt: "Unread messages trend",
    columns: ["month", "unread_messages"],
    minRows: 1,
  },
  {
    prompt: "Support tickets by category and CSAT",
    columns: ["category", "avg_csat", "open_tickets"],
    minRows: 1,
  },
  {
    prompt: "Age distribution of users",
    columns: ["age_band", "users"],
    minRows: 1,
  },
  {
    prompt: "Partner preference patterns",
    columns: ["preferred_sect", "min_education"],
    minRows: 1,
  },
  {
    prompt: "Most viewed profiles",
    columns: ["user_id", "profile_views"],
    minRows: 1,
  },
]

describe("deterministic agent plans", () => {
  it.each(evalPrompts)(
    "runs a grounded non-empty plan for $prompt",
    ({ prompt, columns, minRows }) => {
      const plan = deterministicSql(prompt)
      expect(plan, prompt).not.toBeNull()
      const result = runReadonlyQuery({ sql: plan!.sql })
      for (const column of columns) {
        expect(result.columns).toContain(column)
      }
      expect(result.rows.length).toBeGreaterThanOrEqual(minRows)
    },
  )
})
