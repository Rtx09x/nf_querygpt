"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, KeyRound, Settings2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AppSettings, ProviderId, ReasoningLevel } from "@/lib/querygpt/types"

type SettingsPanelProps = {
  settings: AppSettings | null
  onSettingsChange: (settings: AppSettings) => void
}

const reasoningLevels: ReasoningLevel[] = ["low", "medium", "high"]

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  )
}

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AppSettings | null>(settings)
  const [keys, setKeys] = useState<Record<ProviderId, string>>({
    openai: "",
    gemini: "",
  })
  const [status, setStatus] = useState<string>("")

  if (settings && !draft) setDraft(settings)

  const providerModels = useMemo(() => {
    const result: Record<ProviderId, string[]> = {
      openai: ["gpt-5.4-mini", "gpt-5.5", "gpt-5.4"],
      gemini: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-pro"],
    }
    for (const provider of settings?.providers ?? []) {
      result[provider.id] = provider.models
    }
    return result
  }, [settings])

  const save = async () => {
    if (!draft) return
    setStatus("Saving...")
    const credentials = (Object.keys(keys) as ProviderId[])
      .filter((provider) => keys[provider].trim().length > 0)
      .map((provider) => ({ provider, apiKey: keys[provider].trim() }))

    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: draft, credentials }),
    })
    const payload = await response.json()
    onSettingsChange(payload.settings)
    setKeys({ openai: "", gemini: "" })
    setDraft(payload.settings)
    setStatus("Saved")
  }

  const clearKey = async (provider: ProviderId) => {
    setStatus("Removing key...")
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentials: [{ provider, apiKey: null }] }),
    })
    const payload = await response.json()
    onSettingsChange(payload.settings)
    setDraft(payload.settings)
    setStatus("Key removed")
  }

  const testProvider = async (provider: ProviderId) => {
    if (!draft) return
    setStatus("Testing provider...")
    const model =
      draft.mainAgent.provider === provider
        ? draft.mainAgent.model
        : draft.workerAgent.provider === provider
          ? draft.workerAgent.model
          : providerModels[provider][0]
    const response = await fetch("/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        apiKey: keys[provider] || undefined,
      }),
    })
    const payload = await response.json()
    setStatus(payload.ok ? `${provider} test passed` : payload.error)
  }

  const updateAgent = (
    agent: "mainAgent" | "workerAgent",
    field: "provider" | "model" | "reasoning",
    value: string,
  ) => {
    setDraft((current) => {
      if (!current) return current
      const nextAgent = {
        ...current[agent],
        [field]: value,
      }
      if (field === "provider") {
        nextAgent.model = providerModels[value as ProviderId][0]
      }
      return { ...current, [agent]: nextAgent }
    })
  }

  const providerStatus = (provider: ProviderId) =>
    settings?.providers.find((item) => item.id === provider)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Settings" />}>
        <Settings2 className="size-4" />
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure main reasoning, worker execution, and provider keys.
          </SheetDescription>
        </SheetHeader>

        {draft ? (
          <div className="space-y-6 px-4 pb-4">
            <section className="space-y-3">
              <div className="text-sm font-semibold">Main agent</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <FieldLabel>Provider</FieldLabel>
                  <Select
                    value={draft.mainAgent.provider}
                    onChange={(event) => updateAgent("mainAgent", "provider", event.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Model</FieldLabel>
                  <TextInput
                    value={draft.mainAgent.model}
                    onChange={(event) => updateAgent("mainAgent", "model", event.target.value)}
                    list="main-models"
                  />
                  <datalist id="main-models">
                    {providerModels[draft.mainAgent.provider].map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <FieldLabel>Reasoning</FieldLabel>
                  <Select
                    value={draft.mainAgent.reasoning}
                    onChange={(event) => updateAgent("mainAgent", "reasoning", event.target.value)}
                  >
                    {reasoningLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold">Worker agent</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <FieldLabel>Provider</FieldLabel>
                  <Select
                    value={draft.workerAgent.provider}
                    onChange={(event) => updateAgent("workerAgent", "provider", event.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Model</FieldLabel>
                  <TextInput
                    value={draft.workerAgent.model}
                    onChange={(event) => updateAgent("workerAgent", "model", event.target.value)}
                    list="worker-models"
                  />
                  <datalist id="worker-models">
                    {providerModels[draft.workerAgent.provider].map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <FieldLabel>Reasoning</FieldLabel>
                  <Select
                    value={draft.workerAgent.reasoning}
                    onChange={(event) =>
                      updateAgent("workerAgent", "reasoning", event.target.value)
                    }
                  >
                    {reasoningLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold">Provider keys</div>
              {(["openai", "gemini"] as ProviderId[]).map((provider) => {
                const info = providerStatus(provider)
                return (
                  <div key={provider} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <KeyRound className="size-4" />
                        {provider === "openai" ? "OpenAI" : "Gemini"}
                      </div>
                      {info?.keyConfigured ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3.5" />
                          {info.keyHint}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <TextInput
                        type="password"
                        autoComplete="off"
                        value={keys[provider]}
                        onChange={(event) =>
                          setKeys((current) => ({
                            ...current,
                            [provider]: event.target.value,
                          }))
                        }
                        placeholder={info?.keyConfigured ? "Replace key" : "Paste key"}
                      />
                      <Button variant="outline" size="sm" onClick={() => testProvider(provider)}>
                        Test
                      </Button>
                      {info?.keyConfigured ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${provider} key`}
                          onClick={() => clearKey(provider)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="space-y-2">
              <div className="text-sm font-semibold">Business context</div>
              <textarea
                value={draft.businessContext}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, businessContext: event.target.value } : current,
                  )
                }
                className="min-h-28 w-full resize-none rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </section>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-xs text-muted-foreground">{status}</div>
              <Button onClick={save}>Save settings</Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
