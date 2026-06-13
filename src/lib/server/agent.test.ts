import { describe, expect, it } from "vitest"

import { type Thread } from "@/lib/querygpt/types"
import { deterministicSql, runQueryGptAgent } from "@/lib/server/agent"
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

  it("answers matched eval prompts without requiring a provider call", async () => {
    const thread: Thread = {
      id: "test-thread",
      title: "New chat",
      provider: "gemini",
      model: "gemini-2.5-flash",
      pinned: false,
      archived: false,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
    const result = await runQueryGptAgent({
      thread,
      question: "Age distribution of users",
    })
    expect(result.parts.some((part) => part.type === "sql")).toBe(true)
    expect(result.parts.some((part) => part.type === "chart")).toBe(true)
    expect(result.parts.some((part) => part.type === "error")).toBe(false)
  })

  it("uses the business metric, not identifier columns, for generated charts", async () => {
    const thread: Thread = {
      id: "test-thread",
      title: "New chat",
      provider: "gemini",
      model: "gemini-2.5-flash",
      pinned: false,
      archived: false,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
    const result = await runQueryGptAgent({
      thread,
      question: "Most viewed profiles",
    })
    const chart = result.parts.find((part) => part.type === "chart")
    expect(chart?.type === "chart" ? chart.yKey : null).toBe("profile_views")
  })

  it("prioritizes revenue and unread metrics for chart y axes", async () => {
    const thread: Thread = {
      id: "test-thread",
      title: "New chat",
      provider: "gemini",
      model: "gemini-2.5-flash",
      pinned: false,
      archived: false,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
    const revenue = await runQueryGptAgent({
      thread,
      question: "Which plan generated the most revenue?",
    })
    const revenueChart = revenue.parts.find((part) => part.type === "chart")
    expect(revenueChart?.type === "chart" ? revenueChart.yKey : null).toBe("revenue_inr")

    const unread = await runQueryGptAgent({
      thread,
      question: "Unread messages trend",
    })
    const unreadChart = unread.parts.find((part) => part.type === "chart")
    expect(unreadChart?.type === "chart" ? unreadChart.yKey : null).toBe("unread_messages")
  })
})
