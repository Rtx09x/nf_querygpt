import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { loadApiKey } from "@/lib/server/vault"

export const runtime = "nodejs"

const inputSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const input = inputSchema.parse(await request.json())
  const key = input.apiKey?.trim() || loadApiKey(input.provider)

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "No API key configured for this provider." },
      { status: 400 },
    )
  }

  try {
    const provider =
      input.provider === "openai"
        ? createOpenAI({ apiKey: key })(input.model)
        : createGoogleGenerativeAI({ apiKey: key })(input.model)

    const { text } = await generateText({
      model: provider,
      prompt: "Reply with exactly: ok",
      maxOutputTokens: 8,
    })

    return NextResponse.json({ ok: /ok/i.test(text), text: text.trim() })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Provider test failed.",
      },
      { status: 400 },
    )
  }
}
