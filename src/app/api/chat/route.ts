import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  addMessage,
  createRun,
  createThread,
  finishRun,
  getThread,
  listAttachments,
  listMessages,
  updateThread,
} from "@/lib/server/app-db"
import { runQueryGptAgent } from "@/lib/server/agent"
import { ProviderId } from "@/lib/querygpt/types"

export const runtime = "nodejs"

const inputSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().min(1),
  attachmentIds: z.array(z.string()).default([]),
  provider: z.enum(["openai", "gemini"]).optional(),
  model: z.string().optional(),
})

function attachmentContext(ids: string[]) {
  const attachments = listAttachments(ids)
  if (!attachments.length) return ""
  return attachments
    .map((attachment) => {
      const preview = attachment.textPreview
        ? `\nPreview:\n${attachment.textPreview}`
        : ""
      return `Attachment ${attachment.filename} (${attachment.mimeType}, ${attachment.size} bytes).${preview}`
    })
    .join("\n\n")
}

export async function POST(request: NextRequest) {
  const input = inputSchema.parse(await request.json())
  let thread = input.threadId ? getThread(input.threadId) : null

  if (!thread) {
    thread = createThread({
      provider: input.provider as ProviderId | undefined,
      model: input.model,
    })
  } else if (input.provider || input.model) {
    thread =
      updateThread(thread.id, {
        provider: input.provider ?? thread.provider,
        model: input.model ?? thread.model,
      }) ?? thread
  }

  const userMessage = addMessage(thread.id, "user", [{ type: "text", text: input.message }])
  const runId = createRun({
    threadId: thread.id,
    provider: thread.provider,
    model: thread.model,
  })

  try {
    const result = await runQueryGptAgent({
      thread,
      question: input.message,
      attachmentContext: attachmentContext(input.attachmentIds),
    })

    const assistantMessage = addMessage(thread.id, "assistant", result.parts)
    if (thread.title === "New chat" || thread.title === "New database question") {
      thread = updateThread(thread.id, { title: result.title }) ?? thread
    }
    finishRun(runId, {
      status: "success",
      steps: result.steps,
      latencyMs: result.latencyMs,
    })

    return NextResponse.json({
      thread,
      userMessage,
      assistantMessage,
      messages: listMessages(thread.id),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed."
    const assistantMessage = addMessage(
      thread.id,
      "assistant",
      [{ type: "error", title: "Agent run failed", detail: message }],
      "error",
    )
    finishRun(runId, {
      status: "error",
      steps: 1,
      latencyMs: 0,
      error: message,
    })
    return NextResponse.json(
      { thread, userMessage, assistantMessage, messages: listMessages(thread.id) },
      { status: 500 },
    )
  }
}
