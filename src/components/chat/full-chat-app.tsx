"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  Bot,
  Copy,
  FileText,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react"

import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container"
import { Button } from "@/components/ui/button"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { ScrollButton } from "@/components/ui/scroll-button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ChatPartView } from "@/components/chat/tool-parts"
import { SettingsPanel } from "@/components/chat/settings-panel"
import {
  AppSettings,
  Attachment,
  BootstrapPayload,
  ChatMessage,
  Thread,
} from "@/lib/querygpt/types"
import { cn } from "@/lib/utils"

type MessagesByThread = Record<string, ChatMessage[]>

const starterPrompts = [
  "Revenue ka monthly trend dikhao",
  "Show the interest to match funnel",
  "Top active-user cities?",
  "Support tickets by category and CSAT",
]

function dayLabel(dateString: string) {
  const date = new Date(dateString)
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays <= 7) return "Previous 7 Days"
  return "Older"
}

function groupThreads(threads: Thread[]) {
  const groups: Record<string, Thread[]> = {}
  for (const thread of threads) {
    const label = thread.pinned ? "Pinned" : dayLabel(thread.updatedAt)
    groups[label] ??= []
    groups[label].push(thread)
  }
  return ["Pinned", "Today", "Yesterday", "Previous 7 Days", "Older"]
    .map((label) => ({ label, threads: groups[label] ?? [] }))
    .filter((group) => group.threads.length)
}

function firstText(parts: ChatMessage["parts"]) {
  return parts.find((part) => part.type === "text")?.text ?? ""
}

function ChatSidebar({
  threads,
  activeId,
  search,
  setSearch,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onTogglePin,
  settings,
  onSettingsChange,
}: {
  threads: Thread[]
  activeId: string | null
  search: string
  setSearch: (value: string) => void
  onSelect: (id: string) => void
  onNewChat: () => void
  onRename: (thread: Thread) => void
  onDelete: (id: string) => void
  onTogglePin: (thread: Thread) => void
  settings: AppSettings | null
  onSettingsChange: (settings: AppSettings) => void
}) {
  const filtered = threads.filter((thread) =>
    thread.title.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-3 py-3">
        <div className="flex h-9 items-center justify-between">
          <div className="min-w-0 px-1">
            <div className="truncate text-sm font-semibold">NF QueryGPT</div>
            <div className="truncate text-xs text-muted-foreground">
              two-agent database chat
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={onNewChat}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-lg border bg-background px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No chats yet</div>
        ) : (
          groupThreads(filtered).map((group) => (
            <div key={group.label} className="mb-3">
              <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "group flex min-h-8 items-center gap-1 rounded-lg px-2 text-sm",
                      activeId === thread.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/70",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(thread.id)}
                      onDoubleClick={() => onRename(thread)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {thread.title}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100"
                      aria-label={thread.pinned ? "Unpin chat" : "Pin chat"}
                      onClick={() => onTogglePin(thread)}
                    >
                      {thread.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100"
                      aria-label="Delete chat"
                      onClick={() => onDelete(thread.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 text-xs text-muted-foreground">
            <div className="truncate">Main: {settings?.mainAgent.model ?? "loading"}</div>
            <div className="truncate">Worker: {settings?.workerAgent.model ?? "loading"}</div>
          </div>
          <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function EmptyChat({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-10">
      <div className="mb-5 flex size-10 items-center justify-center rounded-full border bg-background">
        <Bot className="size-4" />
      </div>
      <h1 className="text-2xl font-semibold">Ask NF anything</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Main agent plans the request, worker agent queries SQLite, then the main agent writes the answer.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function AttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) {
  if (!attachments.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1 text-xs"
        >
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="max-w-44 truncate">{attachment.filename}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onRemove(attachment.id)}
          >
            remove
          </button>
        </div>
      ))}
    </div>
  )
}

function ChatContent({
  activeThread,
  messages,
  settings,
  isLoading,
  pendingAttachments,
  onSend,
  onStop,
  onUpload,
  onRemoveAttachment,
}: {
  activeThread: Thread | null
  messages: ChatMessage[]
  settings: AppSettings | null
  isLoading: boolean
  pendingAttachments: Attachment[]
  onSend: (message: string) => void
  onStop: () => void
  onUpload: (file: File) => void
  onRemoveAttachment: (id: string) => void
}) {
  const [prompt, setPrompt] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const submit = (value?: string) => {
    const domValue =
      typeof document === "undefined"
        ? ""
        : (document.querySelector<HTMLTextAreaElement>(
            "[data-querygpt-composer]",
          )?.value ?? "")
    const text = ((value ?? prompt) || domValue).trim()
    if (!text || isLoading) return
    setPrompt("")
    const composer = document.querySelector<HTMLTextAreaElement>(
      "[data-querygpt-composer]",
    )
    if (composer) composer.value = ""
    onSend(text)
  }

  return (
    <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1 md:hidden">
            <Menu className="size-4" />
          </SidebarTrigger>
          <span className="truncate text-sm font-medium">
            {activeThread?.title ?? "New chat"}
          </span>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span>Main {settings?.mainAgent.reasoning ?? "high"}</span>
          <span>Worker {settings?.workerAgent.reasoning ?? "medium"}</span>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {messages.length === 0 ? (
          <EmptyChat onSelect={submit} />
        ) : (
          <ChatContainerRoot className="h-full w-full">
            <ChatContainerContent className="gap-7 px-4 py-10 md:px-6">
              {messages.map((message, index) => {
                const assistant = message.role === "assistant"
                return (
                  <Message
                    key={message.id}
                    className={cn(
                      "group mx-auto w-full max-w-3xl flex-col gap-1",
                      assistant ? "items-start" : "items-end",
                    )}
                  >
                    {assistant ? (
                      <div className="w-full bg-transparent p-0 leading-7">
                        <div className="space-y-1 text-sm">
                          {message.parts.map((part, partIndex) => (
                            <ChatPartView
                              key={partIndex}
                              part={part}
                              onClarification={submit}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <MessageContent
                        markdown={false}
                        className="max-w-[85%] rounded-3xl bg-muted px-5 py-2.5 text-primary"
                      >
                        {firstText(message.parts)}
                      </MessageContent>
                    )}
                    <MessageActions
                      className={cn(
                        "gap-0 opacity-0 transition-opacity group-hover:opacity-100",
                        index === messages.length - 1 && "opacity-100",
                      )}
                    >
                      <MessageAction tooltip="Copy">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Copy message"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              message.parts
                                .map((part) =>
                                  part.type === "text"
                                    ? part.text
                                    : part.type === "sql"
                                      ? part.sql
                                      : "",
                                )
                                .filter(Boolean)
                                .join("\n\n"),
                            )
                          }
                        >
                          <Copy className="size-4" />
                        </Button>
                      </MessageAction>
                    </MessageActions>
                  </Message>
                )
              })}
            </ChatContainerContent>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <ScrollButton className="shadow-sm" />
            </div>
          </ChatContainerRoot>
        )}
      </div>

      <div className="shrink-0 bg-background px-3 pb-3 md:px-5 md:pb-5">
        <div className="mx-auto max-w-3xl">
          <AttachmentStrip attachments={pendingAttachments} onRemove={onRemoveAttachment} />
          <PromptInput
            isLoading={isLoading}
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => submit()}
            className="rounded-3xl border bg-background p-2 shadow-xs"
          >
            <PromptInputTextarea
              data-querygpt-composer
              placeholder="Ask about users, revenue, matches, safety..."
              className="min-h-12 px-3 pt-3 text-base"
            />
            <PromptInputActions className="justify-between px-1 pb-1 pt-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onUpload(file)
                    event.target.value = ""
                  }}
                />
                <PromptInputAction tooltip="Attach file">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                  </Button>
                </PromptInputAction>
                <PromptInputAction tooltip="More">
                  <Button variant="ghost" size="icon" aria-label="More options">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </PromptInputAction>
              </div>
              {isLoading ? (
                <Button size="icon" aria-label="Stop" onClick={onStop}>
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={isLoading}
                  onClick={() => submit()}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>
    </main>
  )
}

export function FullChatApp() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [messagesByThread, setMessagesByThread] = useState<MessagesByThread>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let mounted = true
    fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((payload: BootstrapPayload) => {
        if (!mounted) return
        setThreads(payload.threads)
        setMessagesByThread(payload.messagesByThread)
        setSettings(payload.settings)
        setActiveId(payload.threads[0]?.id ?? null)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!settings) return
    document.documentElement.classList.toggle("dark", settings.theme === "dark")
  }, [settings])

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null
  const messages = activeId ? messagesByThread[activeId] ?? [] : []

  const newChat = () => {
    setActiveId(null)
  }

  const patchThread = async (id: string, patch: Partial<Thread>) => {
    const response = await fetch(`/api/threads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
    const payload = await response.json()
    setThreads((current) =>
      current.map((thread) => (thread.id === id ? payload.thread : thread)),
    )
  }

  const renameThread = (thread: Thread) => {
    const title = window.prompt("Rename chat", thread.title)
    if (title?.trim()) patchThread(thread.id, { title: title.trim() })
  }

  const deleteThreadById = async (id: string) => {
    await fetch(`/api/threads/${id}`, { method: "DELETE" })
    setThreads((current) => current.filter((thread) => thread.id !== id))
    setMessagesByThread((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (activeId === id) setActiveId(null)
  }

  const send = async (message: string) => {
    setIsLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: activeId ?? undefined,
          message,
          provider: activeThread?.provider ?? settings?.mainAgent.provider,
          model: activeThread?.model ?? settings?.mainAgent.model,
          attachmentIds: pendingAttachments.map((attachment) => attachment.id),
        }),
        signal: controller.signal,
      })
      const payload = await response.json()
      setThreads((current) => {
        const exists = current.some((thread) => thread.id === payload.thread.id)
        const next = exists
          ? current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread))
          : [payload.thread, ...current]
        return next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
      })
      setMessagesByThread((current) => ({
        ...current,
        [payload.thread.id]: payload.messages,
      }))
      setActiveId(payload.thread.id)
      setPendingAttachments([])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  const upload = async (file: File) => {
    const form = new FormData()
    form.append("file", file)
    const response = await fetch("/api/attachments", { method: "POST", body: form })
    const payload = await response.json()
    if (payload.attachment) {
      setPendingAttachments((current) => [...current, payload.attachment])
    }
  }

  return (
    <SidebarProvider>
      <ChatSidebar
        threads={threads}
        activeId={activeId}
        search={search}
        setSearch={setSearch}
        onSelect={setActiveId}
        onNewChat={newChat}
        onRename={renameThread}
        onDelete={deleteThreadById}
        onTogglePin={(thread) => patchThread(thread.id, { pinned: !thread.pinned })}
        settings={settings}
        onSettingsChange={setSettings}
      />
      <SidebarInset>
        <ChatContent
          activeThread={activeThread}
          messages={messages}
          settings={settings}
          isLoading={isLoading}
          pendingAttachments={pendingAttachments}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          onUpload={upload}
          onRemoveAttachment={(id) =>
            setPendingAttachments((current) =>
              current.filter((attachment) => attachment.id !== id),
            )
          }
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
