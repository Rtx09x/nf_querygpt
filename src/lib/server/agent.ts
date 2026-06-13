import { generateObject, generateText } from "ai"
import { z } from "zod"

import { ChatPart, ProviderId, Thread } from "@/lib/querygpt/types"
import { getAppSettings } from "@/lib/server/app-db"
import { createModelHandle } from "@/lib/server/providers"
import {
  dataWindowSummary,
  getCatalog,
  schemaSummary,
} from "@/lib/server/schema-catalog"
import { runReadonlyQuery } from "@/lib/server/sql-gateway"

const mainPlanSchema = z.object({
  route: z.enum(["direct", "database", "clarify"]),
  cleanedWorkerPrompt: z.string().min(1),
  reasoning: z.string().min(1),
  clarificationQuestion: z.string().optional(),
  clarificationOptions: z.array(z.string()).default([]),
  expectedView: z.enum(["auto", "table", "bar", "line", "stats"]).default("auto"),
})

const workerSqlSchema = z.object({
  sql: z.string().min(1),
  explanation: z.string().min(1),
  view: z.enum(["auto", "table", "bar", "line", "stats"]).default("auto"),
})

type MainPlan = z.infer<typeof mainPlanSchema>

type AgentRunInput = {
  thread: Thread
  question: string
  attachmentContext?: string
}

type DeterministicPlan = {
  sql: string
  explanation: string
  view: "auto" | "table" | "bar" | "line" | "stats"
}

function lower(input: string) {
  return input.toLowerCase()
}

function titleFromQuestion(question: string) {
  const compact = question.replace(/\s+/g, " ").trim()
  if (compact.length <= 44) return compact || "New chat"
  return `${compact.slice(0, 41)}...`
}

const knownCities = [
  "Delhi",
  "Mumbai",
  "Hyderabad",
  "Bengaluru",
  "Lucknow",
  "Kolkata",
  "Chennai",
  "Bhopal",
  "Srinagar",
  "Patna",
  "Jaipur",
  "Aligarh",
]

function quoted(value: string) {
  return value.replace(/'/g, "''")
}

function cityIn(question: string) {
  const q = lower(question)
  return knownCities.find((city) => q.includes(city.toLowerCase())) ?? null
}

function userStatusFilter(question: string) {
  const q = lower(question)
  if (/(deactivated|inactive|disabled)/.test(q)) return "LOWER(account_status) = 'deactivated'"
  if (/(suspended|blocked|banned)/.test(q)) return "LOWER(account_status) = 'suspended'"
  if (/(active|currently active|live users)/.test(q)) return "LOWER(account_status) = 'active'"
  return "1 = 1"
}

export function deterministicSql(question: string): DeterministicPlan | null {
  const q = lower(question)
  const requestedCity = cityIn(question)

  if (/(schema|relationship|graph|tables|columns|database structure)/.test(q)) {
    return {
      sql: `
        SELECT 'users' AS source, 'profiles' AS target, 'user_id' AS relation
        UNION ALL SELECT 'users', 'partner_preferences', 'user_id'
        UNION ALL SELECT 'users', 'subscriptions', 'user_id'
        UNION ALL SELECT 'subscriptions', 'plans', 'plan_id'
        UNION ALL SELECT 'users', 'payments', 'user_id'
        UNION ALL SELECT 'users', 'interests', 'sender_id / receiver_id'
        UNION ALL SELECT 'interests', 'matches', 'source_interest_id'
        UNION ALL SELECT 'matches', 'messages', 'match_id'
        UNION ALL SELECT 'users', 'profile_views', 'viewer_id / viewed_id'
        UNION ALL SELECT 'users', 'reports', 'reporter_id / reported_id'
        UNION ALL SELECT 'users', 'support_tickets', 'user_id'
      `,
      explanation: "Database relationship graph.",
      view: "table",
    }
  }

  if (
    requestedCity &&
    /(how many|count|total).*(user|member|profile|active)|active.*(user|member|profile)/.test(q)
  ) {
    return {
      sql: `
        SELECT
          city,
          COUNT(*) AS users,
          SUM(CASE WHEN LOWER(account_status) = 'active' THEN 1 ELSE 0 END) AS active_users,
          SUM(is_verified) AS verified_users
        FROM users
        WHERE city = '${quoted(requestedCity)}'
        GROUP BY city
      `,
      explanation: `User count for ${requestedCity}.`,
      view: "stats",
    }
  }

  if (/(city|cities|location|state|where|delhi|mumbai|hyderabad|bengaluru|lucknow|kolkata|chennai)/.test(q)) {
    return {
      sql: `
        SELECT city, state, COUNT(*) AS active_users
        FROM users
        WHERE ${userStatusFilter(question)}
        GROUP BY city, state
        ORDER BY active_users DESC
        LIMIT 15
      `,
      explanation: "Top user locations using the requested account-status filter.",
      view: "bar",
    }
  }

  if (/(recent|last active|active.*30|30 days|dau|mau)/.test(q)) {
    return {
      sql: `
        SELECT
          COUNT(*) AS active_last_30_days,
          ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM users), 2) AS pct_of_users
        FROM users
        WHERE last_active_at >= datetime((SELECT MAX(last_active_at) FROM users), '-30 days')
      `,
      explanation: "Users active in the last 30 days of the dataset window.",
      view: "stats",
    }
  }

  if (/(how many|count|total).*(user|member|profile)|user base|members/.test(q)) {
    return {
      sql: `
        SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN LOWER(account_status) = 'active' THEN 1 ELSE 0 END) AS active_users,
          SUM(CASE WHEN LOWER(account_status) = 'suspended' THEN 1 ELSE 0 END) AS suspended_users,
          SUM(is_verified) AS verified_users
        FROM users
      `,
      explanation: "Total, active, and verified users.",
      view: "stats",
    }
  }

  if (/(growth|signup|sign-up|created|new users|registrations)/.test(q)) {
    return {
      sql: `
        SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS users
        FROM users
        GROUP BY month
        ORDER BY month
      `,
      explanation: "Monthly user signup trend.",
      view: "line",
    }
  }

  if (/(plan|subscription|premium|package).*(revenue|payment|earn|sales|income)|(revenue|payment).*(plan|subscription|premium|package)/.test(q)) {
    return {
      sql: `
        SELECT
          pl.plan_name,
          COUNT(p.payment_id) AS successful_payments,
          SUM(p.amount_inr) AS revenue_inr,
          ROUND(AVG(p.amount_inr), 2) AS avg_payment_inr
        FROM payments p
        JOIN subscriptions s ON s.subscription_id = p.subscription_id
        JOIN plans pl ON pl.plan_id = s.plan_id
        WHERE LOWER(p.status) = 'success'
        GROUP BY pl.plan_id, pl.plan_name
        ORDER BY revenue_inr DESC
      `,
      explanation: "Successful payment revenue by subscription plan.",
      view: "bar",
    }
  }

  if (/(method|upi|card|wallet|netbanking)/.test(q)) {
    return {
      sql: `
        SELECT method, COUNT(*) AS payments, SUM(amount_inr) AS revenue_inr
        FROM payments
        WHERE LOWER(status) = 'success'
        GROUP BY method
        ORDER BY revenue_inr DESC
      `,
      explanation: "Payment performance by method.",
      view: "bar",
    }
  }

  if (/(revenue|payment|earn|sales|income)/.test(q)) {
    return {
      sql: `
        SELECT strftime('%Y-%m', created_at) AS month, SUM(amount_inr) AS revenue_inr
        FROM payments
        WHERE LOWER(status) = 'success'
        GROUP BY month
        ORDER BY month
      `,
      explanation: "Monthly successful payment revenue.",
      view: "line",
    }
  }

  if (/(funnel|conversion|interest.*match|match.*message)/.test(q)) {
    return {
      sql: `
        SELECT 'users' AS stage, COUNT(*) AS metric_value FROM users
        UNION ALL SELECT 'interests_sent', COUNT(*) FROM interests
        UNION ALL SELECT 'interests_accepted', COUNT(*) FROM interests WHERE LOWER(status) = 'accepted'
        UNION ALL SELECT 'matches', COUNT(*) FROM matches
        UNION ALL SELECT 'messages', COUNT(*) FROM messages
      `,
      explanation: "Relationship funnel from users to messages.",
      view: "bar",
    }
  }

  if (/(interest|accepted|declined|pending|acceptance rate|response rate)/.test(q)) {
    return {
      sql: `
        SELECT
          status,
          COUNT(*) AS interests,
          ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM interests), 2) AS pct_of_interests
        FROM interests
        GROUP BY status
        ORDER BY interests DESC
      `,
      explanation: "Interest outcomes and share of total interests.",
      view: "bar",
    }
  }

  if (/(match|matched).*(month|trend|growth|time)|monthly matches/.test(q)) {
    return {
      sql: `
        SELECT strftime('%Y-%m', matched_at) AS month, COUNT(*) AS matches
        FROM matches
        GROUP BY month
        ORDER BY month
      `,
      explanation: "Monthly match trend.",
      view: "line",
    }
  }

  if (/(message|chat|conversation|unread|read rate)/.test(q)) {
    return {
      sql: `
        SELECT
          strftime('%Y-%m', sent_at) AS month,
          COUNT(*) AS messages,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_messages,
          ROUND(100.0 * SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS read_rate_pct
        FROM messages
        GROUP BY month
        ORDER BY month
      `,
      explanation: "Monthly message volume and read rate.",
      view: "line",
    }
  }

  if (/(support|ticket|csat|customer care|resolution)/.test(q)) {
    return {
      sql: `
        SELECT
          category,
          COUNT(*) AS tickets,
          ROUND(AVG(csat_score), 2) AS avg_csat,
          SUM(CASE WHEN LOWER(status) = 'open' THEN 1 ELSE 0 END) AS open_tickets,
          ROUND(AVG(CASE
            WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24
            ELSE NULL
          END), 2) AS avg_resolution_hours
        FROM support_tickets
        GROUP BY category
        ORDER BY tickets DESC
      `,
      explanation: "Support ticket mix and satisfaction.",
      view: "table",
    }
  }

  if (/(report|abuse|fake|harassment|spam|moderation)/.test(q)) {
    return {
      sql: `
        SELECT reason, status, COUNT(*) AS reports
        FROM reports
        GROUP BY reason, status
        ORDER BY reports DESC
      `,
      explanation: "Reports grouped by reason and status.",
      view: "bar",
    }
  }

  if (/(age|dob|old|younger|older)/.test(q)) {
    return {
      sql: `
        SELECT
          CASE
            WHEN CAST((julianday((SELECT MAX(last_active_at) FROM users)) - julianday(dob)) / 365.25 AS INTEGER) < 25 THEN 'under_25'
            WHEN CAST((julianday((SELECT MAX(last_active_at) FROM users)) - julianday(dob)) / 365.25 AS INTEGER) < 30 THEN '25_29'
            WHEN CAST((julianday((SELECT MAX(last_active_at) FROM users)) - julianday(dob)) / 365.25 AS INTEGER) < 35 THEN '30_34'
            WHEN CAST((julianday((SELECT MAX(last_active_at) FROM users)) - julianday(dob)) / 365.25 AS INTEGER) < 40 THEN '35_39'
            ELSE '40_plus'
          END AS age_band,
          COUNT(*) AS users
        FROM users
        GROUP BY age_band
        ORDER BY users DESC
      `,
      explanation: "User age distribution based on DOB and the dataset activity window.",
      view: "bar",
    }
  }

  if (/(gender|male|female|sect|sunni|shia|education|profession|occupation|job|marital|mother tongue|language|managed by|income)/.test(q)) {
    const dimension =
      /(sect|sunni|shia)/.test(q)
        ? "sect"
        : /education/.test(q)
          ? "education_level"
          : /(profession|occupation|job)/.test(q)
            ? "profession"
            : /marital/.test(q)
              ? "marital_status"
              : /(mother tongue|language)/.test(q)
                ? "mother_tongue"
                : /managed by/.test(q)
                  ? "managed_by"
                  : /income/.test(q)
                    ? "annual_income_inr"
                    : "gender"
    return {
      sql: `
        SELECT ${dimension}, COUNT(*) AS users
        FROM users
        GROUP BY ${dimension}
        ORDER BY users DESC
        LIMIT 15
      `,
      explanation: `User count by ${dimension.replace(/_/g, " ")}.`,
      view: "bar",
    }
  }

  if (/(verified|verification)/.test(q)) {
    return {
      sql: `
        SELECT
          CASE WHEN is_verified = 1 THEN 'verified' ELSE 'not_verified' END AS verification_status,
          COUNT(*) AS users
        FROM users
        GROUP BY is_verified
      `,
      explanation: "Verified versus unverified users.",
      view: "stats",
    }
  }

  if (/(partner preference|preferences|preferred|looking for)/.test(q)) {
    return {
      sql: `
        SELECT
          preferred_sect,
          min_education,
          COUNT(*) AS users,
          ROUND(AVG(min_age), 1) AS avg_min_age,
          ROUND(AVG(max_age), 1) AS avg_max_age
        FROM partner_preferences
        GROUP BY preferred_sect, min_education
        ORDER BY users DESC
        LIMIT 15
      `,
      explanation: "Partner preference patterns by sect and minimum education.",
      view: "table",
    }
  }

  if (/(plan|subscription|premium|package)/.test(q)) {
    return {
      sql: `
        SELECT
          p.plan_name,
          p.price_inr,
          COUNT(s.subscription_id) AS subscriptions,
          SUM(CASE WHEN LOWER(s.status) = 'active' THEN 1 ELSE 0 END) AS active_subscriptions
        FROM plans p
        LEFT JOIN subscriptions s ON s.plan_id = p.plan_id
        GROUP BY p.plan_id, p.plan_name, p.price_inr
        ORDER BY subscriptions DESC
      `,
      explanation: "Subscription volume by plan.",
      view: "table",
    }
  }

  if (/(profile view|views|viewed most|most viewed)/.test(q)) {
    return {
      sql: `
        SELECT
          u.user_id,
          u.city,
          u.gender,
          COUNT(pv.view_id) AS profile_views
        FROM profile_views pv
        JOIN users u ON u.user_id = pv.viewed_id
        GROUP BY u.user_id, u.city, u.gender
        ORDER BY profile_views DESC
        LIMIT 15
      `,
      explanation: "Most viewed profiles with basic user attributes.",
      view: "bar",
    }
  }

  if (/(profile complete|completeness|photo|bio)/.test(q)) {
    return {
      sql: `
        SELECT
          CASE
            WHEN profile_completeness_pct >= 90 THEN '90-100'
            WHEN profile_completeness_pct >= 70 THEN '70-89'
            WHEN profile_completeness_pct >= 50 THEN '50-69'
            ELSE 'below_50'
          END AS completeness_band,
          COUNT(*) AS profiles,
          ROUND(AVG(photo_count), 2) AS avg_photos
        FROM profiles
        GROUP BY completeness_band
        ORDER BY completeness_band DESC
      `,
      explanation: "Profile completeness distribution.",
      view: "bar",
    }
  }

  return null
}

function isNumeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
}

function resultParts(result: ReturnType<typeof runReadonlyQuery>, view: string): ChatPart[] {
  const parts: ChatPart[] = [
    {
      type: "progress",
      title: "Database run",
      steps: [
        { label: "Parsed intent", status: "done" },
        { label: "Generated read-only SQL", status: "done" },
        { label: `Returned ${result.rows.length} visible rows`, status: "done" },
      ],
    },
    { type: "sql", sql: result.sql },
  ]

  if (result.rows.length === 1) {
    const row = result.rows[0]
    const numericEntries = Object.entries(row).filter(([, value]) => isNumeric(value))
    if (numericEntries.length > 0 && (view === "stats" || result.columns.length <= 4)) {
      parts.push({
        type: "stats",
        items: Object.entries(row).map(([label, value]) => ({
          label: label.replace(/_/g, " "),
          value: value === null ? "null" : String(value),
        })),
      })
    }
  }

  const numericColumn = result.columns.find((column) =>
    result.rows.some((row) => isNumeric(row[column])),
  )
  const labelColumn = result.columns.find((column) => column !== numericColumn)
  if (
    numericColumn &&
    labelColumn &&
    result.rows.length > 1 &&
    ["bar", "line", "auto"].includes(view)
  ) {
    const line =
      view === "line" ||
      /date|month|year|created|sent|matched|viewed/i.test(labelColumn)
    parts.push({
      type: "chart",
      chartType: line ? "line" : "bar",
      xKey: labelColumn,
      yKey: numericColumn,
      data: result.rows.slice(0, 50),
    })
  }

  parts.push({
    type: "table",
    columns: result.columns,
    rows: result.rows,
    rowCount: result.totalRows,
    truncated: result.truncated,
    exportId: result.exportId,
  })

  return parts
}

function fallbackFinalAnswer(question: string, explanation: string, result: ReturnType<typeof runReadonlyQuery>) {
  if (result.rows.length === 0) {
    return `${explanation} The query returned no rows, so there is no chartable result for this request.`
  }

  const firstRow = result.rows[0]
  const singleMetric =
    result.rows.length === 1 && Object.keys(firstRow).length <= 4
      ? Object.entries(firstRow)
          .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
          .join(", ")
      : null

  if (singleMetric) return `${explanation} ${singleMetric}.`

  const topValues = result.rows
    .slice(0, 3)
    .map((row) =>
      Object.entries(row)
        .slice(0, 3)
        .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
        .join(", "),
    )
    .join("; ")

  return `${explanation} I found ${result.totalRows} row${
    result.totalRows === 1 ? "" : "s"
  }. Top results: ${topValues}.`
}

async function planWithMainAgent(input: AgentRunInput): Promise<MainPlan> {
  const settings = getAppSettings()
  const main = createModelHandle(settings.mainAgent)
  const fallback = deterministicSql(input.question)

  if (!main.configured || !main.model) {
    if (fallback) {
      return {
        route: "database",
        cleanedWorkerPrompt: input.question,
        reasoning: "No main-agent key configured; deterministic routing matched a database intent.",
        expectedView: fallback.view,
        clarificationOptions: [],
      }
    }
    return {
      route: "clarify",
      cleanedWorkerPrompt: input.question,
      reasoning: "No main-agent key configured and deterministic routing could not classify the request.",
      clarificationQuestion:
        "I can answer common database questions right now. For arbitrary natural language, add an OpenAI or Gemini key in Settings. What should I analyze?",
      clarificationOptions: [
        "User growth",
        "Revenue trend",
        "Match funnel",
        "Support tickets",
      ],
      expectedView: "auto",
    }
  }

  const { object } = await generateObject({
    model: main.model,
    schema: mainPlanSchema,
    prompt: `
You are the main reasoning agent for NF QueryGPT.

Decide whether the user needs:
- direct: answer from general/product context without database execution
- database: produce a clean worker prompt for the database worker
- clarify: ask a clarifying question before database work

Reasoning level selected by user: ${settings.mainAgent.reasoning}.
Business context: ${settings.businessContext}
${dataWindowSummary()}

Database schema:
${schemaSummary()}

Important enum values:
- users.account_status is lowercase: active, deactivated, suspended.
- payments.status is lowercase: success, failed, refunded.
- subscriptions.status is lowercase: active, expired, cancelled.
- interests.status is lowercase: pending, accepted, declined.
- support_tickets.status is lowercase: open, resolved, closed.
- reports.status is lowercase: open, actioned, dismissed.

Attachment context:
${input.attachmentContext || "None"}

User message:
${input.question}

Return a concise, precise worker prompt when route is database. Do not invent unavailable schema.
    `,
  })

  return object
}

async function workerSql(input: {
  question: string
  cleanedWorkerPrompt: string
  expectedView: string
}): Promise<DeterministicPlan> {
  const settings = getAppSettings()
  const worker = createModelHandle(settings.workerAgent)
  const fallback = deterministicSql(input.cleanedWorkerPrompt) ?? deterministicSql(input.question)

  if (!worker.configured || !worker.model) {
    if (fallback) return fallback
    throw new Error("Worker agent key is not configured and no deterministic SQL template matched.")
  }

  const { object } = await generateObject({
    model: worker.model,
    schema: workerSqlSchema,
    prompt: `
You are the worker database agent for NF QueryGPT.

Generate one safe SQLite SELECT or WITH query only. No mutation. No PRAGMA. No ATTACH.
Reasoning level selected by user: ${settings.workerAgent.reasoning}.

Database schema:
${schemaSummary()}

Important enum values:
- users.account_status is lowercase: active, deactivated, suspended.
- payments.status is lowercase: success, failed, refunded.
- subscriptions.status is lowercase: active, expired, cancelled.
- interests.status is lowercase: pending, accepted, declined.
- support_tickets.status is lowercase: open, resolved, closed.
- reports.status is lowercase: open, actioned, dismissed.

Worker task:
${input.cleanedWorkerPrompt}

If the task is ambiguous, choose the safest useful aggregate and explain the assumption.
    `,
  })

  return object
}

async function finalAnswer(input: {
  question: string
  explanation: string
  result: ReturnType<typeof runReadonlyQuery>
}) {
  return fallbackFinalAnswer(input.question, input.explanation, input.result)
}

export async function runQueryGptAgent(input: AgentRunInput) {
  const startedAt = performance.now()
  const settings = getAppSettings()
  const plan = await planWithMainAgent(input)

  if (plan.route === "clarify") {
    return {
      title: titleFromQuestion(input.question),
      steps: 1,
      latencyMs: Math.round(performance.now() - startedAt),
      parts: [
        {
          type: "clarification",
          question: plan.clarificationQuestion ?? "Can you clarify what you want to analyze?",
          options: plan.clarificationOptions,
          allowFreeText: true,
        },
      ] satisfies ChatPart[],
    }
  }

  if (plan.route === "direct") {
    const main = createModelHandle(settings.mainAgent)
    if (!main.configured || !main.model) {
      return {
        title: titleFromQuestion(input.question),
        steps: 1,
        latencyMs: Math.round(performance.now() - startedAt),
        parts: [
          {
            type: "text",
            text:
              "I can answer direct non-database questions after you configure an OpenAI or Gemini key in Settings. Database demo templates still work without keys.",
          },
        ] satisfies ChatPart[],
      }
    }

    const { text } = await generateText({
      model: main.model,
      prompt: `
Answer directly as NF QueryGPT. Be concise.
Business context: ${settings.businessContext}
User message: ${input.question}
      `,
    })
    return {
      title: titleFromQuestion(input.question),
      steps: 1,
      latencyMs: Math.round(performance.now() - startedAt),
      parts: [{ type: "text", text: text.trim() }] satisfies ChatPart[],
    }
  }

  const sqlPlan = await workerSql({
    question: input.question,
    cleanedWorkerPrompt: plan.cleanedWorkerPrompt,
    expectedView: plan.expectedView,
  })
  let result: ReturnType<typeof runReadonlyQuery>
  let finalSqlPlan = sqlPlan
  const fallback =
    deterministicSql(plan.cleanedWorkerPrompt) ?? deterministicSql(input.question)
  try {
    result = runReadonlyQuery({ sql: sqlPlan.sql })
    if (result.rows.length === 0 && fallback) {
      finalSqlPlan = fallback
      result = runReadonlyQuery({ sql: fallback.sql })
    }
  } catch (error) {
    if (!fallback) throw error
    finalSqlPlan = fallback
    result = runReadonlyQuery({ sql: fallback.sql })
  }
  const answer = await finalAnswer({
    question: input.question,
    explanation: finalSqlPlan.explanation,
    result,
  })

  return {
    title: titleFromQuestion(input.question),
    steps: 3,
    latencyMs: Math.round(performance.now() - startedAt),
    parts: [
      { type: "text", text: answer },
      ...resultParts(result, finalSqlPlan.view),
    ] satisfies ChatPart[],
  }
}

export function relationshipGraphText() {
  const lines = getCatalog().flatMap((table) =>
    table.foreignKeys.map((fk) => `${table.name}.${fk.from} -> ${fk.table}.${fk.to}`),
  )
  return lines.join("\n")
}

export function agentLabel(provider: ProviderId, model: string) {
  return `${provider}:${model}`
}
