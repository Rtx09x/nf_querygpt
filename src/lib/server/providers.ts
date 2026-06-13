import { LanguageModel } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"

import { AgentModelConfig, ProviderId } from "@/lib/querygpt/types"
import { loadApiKey } from "@/lib/server/vault"

export type ModelHandle = {
  configured: boolean
  model: LanguageModel | null
  provider: ProviderId
  modelId: string
  missingReason?: string
}

export function createModelHandle(config: AgentModelConfig): ModelHandle {
  const apiKey = loadApiKey(config.provider)
  if (!apiKey) {
    return {
      configured: false,
      model: null,
      provider: config.provider,
      modelId: config.model,
      missingReason: `${config.provider} key is not configured`,
    }
  }

  if (config.provider === "openai") {
    const openai = createOpenAI({ apiKey })
    return {
      configured: true,
      model: openai(config.model),
      provider: config.provider,
      modelId: config.model,
    }
  }

  const google = createGoogleGenerativeAI({ apiKey })
  return {
    configured: true,
    model: google(config.model),
    provider: config.provider,
    modelId: config.model,
  }
}

export function providerSupportsFiles(provider: ProviderId, mimeType: string) {
  if (mimeType.startsWith("image/")) return true
  if (mimeType === "application/pdf") return provider === "openai" || provider === "gemini"
  return false
}
