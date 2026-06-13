import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAppSettings, updateSettings } from "@/lib/server/app-db"
import { removeApiKey, saveApiKey } from "@/lib/server/vault"

export const runtime = "nodejs"

const providerSchema = z.enum(["openai", "gemini"])
const settingsSchema = z.object({
  defaultProvider: providerSchema.optional(),
  defaultModel: z.string().min(1).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  businessContext: z.string().optional(),
  mainAgent: z
    .object({
      provider: providerSchema,
      model: z.string().min(1),
      reasoning: z.enum(["low", "medium", "high"]),
    })
    .optional(),
  workerAgent: z
    .object({
      provider: providerSchema,
      model: z.string().min(1),
      reasoning: z.enum(["low", "medium", "high"]),
    })
    .optional(),
})

export async function GET() {
  return NextResponse.json({ settings: getAppSettings() })
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    settings?: unknown
    credentials?: Array<{ provider: "openai" | "gemini"; apiKey?: string | null }>
  }

  if (body.settings) {
    updateSettings(settingsSchema.parse(body.settings))
  }

  for (const credential of body.credentials ?? []) {
    if (!credential.apiKey) {
      removeApiKey(credential.provider)
    } else {
      saveApiKey(credential.provider, credential.apiKey)
    }
  }

  return NextResponse.json({ settings: getAppSettings() })
}
