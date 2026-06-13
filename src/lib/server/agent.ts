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

function deterministicSql(question: string): DeterministicPlan | null {
  const q = lower(question)

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

  if (/(how many|count|total).*(user|member|profile)/.test(q)) {
    return {
      sql: `
        SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active_users,
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

  if (/(revenue|payment|earn|sales|income)/.test(q)) {
    return {
      sql: `
        SELECT strftime('%Y-%m', created_at) AS month, SUM(amount_inr) AS revenue_inr
        FROM payments
        WHERE status = 'success'
        GROUP BY month
        ORDER BY month
      `,
      explanation: "Monthly successful payment revenue.",
      view: "line",
    }
  }

  if (/(method|upi|card|wallet|netbanking)/.test(q)) {
    return {
      sql: `
        SELECT method, COUNT(*) AS payments, SUM(amount_inr) AS revenue_inr
        FROM payments
        WHERE status = 'success'
        GROUP BY method
        ORDER BY revenue_inr DESC
      `,
      explanation: "Payment performance by method.",
      view: "bar",
    }
  }

  if (/(funnel|conversion|interest.*match|match.*message)/.test(q)) {
    return {
      sql: `
        SELECT 'users' AS stage, COUNT(*) AS count FROM users
        UNION ALL SELECT 'interests_sent', COUNT(*) FROM interests
        UNION ALL SELECT 'interests_accepted', COUNT(*) FROM interests WHERE status = 'accepted'
        UNION ALL SELECT 'matches', COUNT(*) FROM matches
        UNION ALL SELECT 'messages', COUNT(*) FROM messages
      `,
      explanation: "Relationship funnel from users to messages.",
      view: "bar",
    }
  }

  if (/(support|ticket|csat|customer care|resolution)/.test(q)) {
    return {
      sql: `
        SELECT
          category,
          COUNT(*) AS tickets,
          ROUND(AVG(csat_score), 2) AS avg_csat,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_tickets
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

  if (/(city|cities|location|state|where)/.test(q)) {
    return {
      sql: `
        SELECT city, state, COUNT(*) AS users
        FROM users
        WHERE account_status = 'active'
        GROUP BY city, state
        ORDER BY users DESC
        LIMIT 15
      `,
      explanation: "Top active-user locations.",
      view: "bar",
    }
  }

  if (/(gender|male|female)/.test(q)) {
    return {
      sql: `
        SELECT gender, COUNT(*) AS users
        FROM users
        GROUP BY gender
        ORDER BY users DESC
      `,
      explanation: "User count by gender.",
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

  if (/(plan|subscription|premium|package)/.test(q)) {
    return {
      sql: `
        SELECT
          p.plan_name,
          p.price_inr,
          COUNT(s.subscription_id) AS subscriptions,
          SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active_subscriptions
        FROM plans p
        LEFT JOIN subscriptions s ON s.plan_id = p.plan_id
        GROUP BY p.plan_id, p.plan_name, p.price_inr
        ORDER BY subscriptions DESC
      `,
      explanation: "Subscription volume by plan.",
      view: "table",
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
    return `I ran the database query for: "${question}". It returned no rows.`
  }

  const firstRow = result.rows[0]
  const singleMetric =
    result.rows.length === 1 && Object.keys(firstRow).length <= 4
      ? Object.entries(firstRow)
          .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
          .join(", ")
      : null

  if (singleMetric) return `${explanation} ${singleMetric}.`

  return `${explanation} I found ${result.totalRows} row${
    result.totalRows === 1 ? "" : "s"
  }. The table and SQL are shown below.`
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
  const settings = getAppSettings()
  const main = createModelHandle(settings.mainAgent)
  if (!main.configured || !main.model) {
    return fallbackFinalAnswer(input.question, input.explanation, input.result)
  }

  const sampleRows = JSON.stringify(input.result.rows.slice(0, 10), null, 2)
  const { text } = await generateText({
    model: main.model,
    prompt: `
You are the final answer agent for NF QueryGPT. Write a concise answer in the user's language/style.
Mention any assumptions and point out that SQL/results are shown below. Do not invent facts beyond the rows.

User question:
${input.question}

Worker explanation:
${input.explanation}

SQL:
${input.result.sql}

Columns: ${input.result.columns.join(", ")}
Returned rows: ${input.result.totalRows}
Sample rows:
${sampleRows}
    `,
  })

  return text.trim()
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
  try {
    result = runReadonlyQuery({ sql: sqlPlan.sql })
  } catch (error) {
    const fallback =
      deterministicSql(plan.cleanedWorkerPrompt) ?? deterministicSql(input.question)
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
