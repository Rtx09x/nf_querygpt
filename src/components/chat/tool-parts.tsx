"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Check, Circle, Copy, Download, Loader2, XCircle } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  CodeBlock,
  CodeBlockCode,
  CodeBlockGroup,
} from "@/components/ui/code-block"
import { ChatPart, SqlScalar } from "@/lib/querygpt/types"
import { cn } from "@/lib/utils"

function scalarText(value: SqlScalar) {
  if (value === null) return "null"
  return String(value)
}

export function ProgressPart({ part }: { part: Extract<ChatPart, { type: "progress" }> }) {
  return (
    <div className="not-prose my-3 rounded-lg border bg-card p-3">
      <div className="mb-2 text-sm font-medium">{part.title}</div>
      <div className="space-y-2">
        {part.steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-sm">
            {step.status === "done" ? (
              <Check className="size-3.5 text-muted-foreground" />
            ) : step.status === "running" ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : step.status === "error" ? (
              <XCircle className="size-3.5 text-destructive" />
            ) : (
              <Circle className="size-3.5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SqlPart({ sql }: { sql: string }) {
  return (
    <CodeBlock className="my-3 rounded-lg">
      <CodeBlockGroup className="border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Generated SQL</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy SQL"
          onClick={() => navigator.clipboard.writeText(sql)}
        >
          <Copy className="size-3.5" />
        </Button>
      </CodeBlockGroup>
      <CodeBlockCode code={sql.trim()} language="sql" />
    </CodeBlock>
  )
}

export function StatsPart({ part }: { part: Extract<ChatPart, { type: "stats" }> }) {
  return (
    <div className="not-prose my-3 grid gap-2 sm:grid-cols-3">
      {part.items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{item.value}</div>
          {item.detail ? (
            <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function ChartPart({ part }: { part: Extract<ChatPart, { type: "chart" }> }) {
  const chartData = part.data.map((row) => ({
    ...row,
    [part.xKey]: scalarText(row[part.xKey]),
  }))

  return (
    <div className="not-prose my-3 rounded-lg border bg-card p-3">
      <div className="mb-3 text-sm font-medium">
        {part.yKey.replace(/_/g, " ")} by {part.xKey.replace(/_/g, " ")}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {part.chartType === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={part.xKey} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <ChartTooltip />
              <Line type="monotone" dataKey={part.yKey} stroke="var(--foreground)" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={part.xKey} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <ChartTooltip />
              <Bar dataKey={part.yKey} fill="var(--foreground)" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TablePart({ part }: { part: Extract<ChatPart, { type: "table" }> }) {
  return (
    <div className="not-prose my-3 overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {part.rowCount} row{part.rowCount === 1 ? "" : "s"}
          {part.truncated ? " visible subset" : ""}
        </span>
        {part.exportId ? (
          <a
            href={`/api/exports/${part.exportId}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Download className="size-3.5" />
            CSV
          </a>
        ) : null}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {part.columns.map((column) => (
                <th key={column} className="border-b px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {part.rows.map((row, index) => (
              <tr key={index} className="border-b last:border-b-0">
                {part.columns.map((column) => (
                  <td key={column} className="px-3 py-2 text-muted-foreground">
                    {scalarText(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ClarificationPart({
  part,
  onSelect,
}: {
  part: Extract<ChatPart, { type: "clarification" }>
  onSelect: (value: string) => void
}) {
  return (
    <div className="not-prose my-3 rounded-lg border bg-card p-3">
      <div className="text-sm font-medium">{part.question}</div>
      {part.options.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {part.options.map((option) => (
            <Button key={option} variant="outline" size="sm" onClick={() => onSelect(option)}>
              {option}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ErrorPart({ part }: { part: Extract<ChatPart, { type: "error" }> }) {
  return (
    <div className="not-prose my-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div className="text-sm font-medium text-destructive">{part.title}</div>
      {part.detail ? (
        <div className="mt-1 text-sm text-muted-foreground">{part.detail}</div>
      ) : null}
    </div>
  )
}

export function ChatPartView({
  part,
  onClarification,
}: {
  part: ChatPart
  onClarification: (value: string) => void
}) {
  if (part.type === "text") return <div className="whitespace-pre-wrap">{part.text}</div>
  if (part.type === "progress") return <ProgressPart part={part} />
  if (part.type === "sql") return <SqlPart sql={part.sql} />
  if (part.type === "stats") return <StatsPart part={part} />
  if (part.type === "chart") return <ChartPart part={part} />
  if (part.type === "table") return <TablePart part={part} />
  if (part.type === "clarification") {
    return <ClarificationPart part={part} onSelect={onClarification} />
  }
  return <ErrorPart part={part} />
}

export function ToolShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("not-prose", className)} {...props} />
}
