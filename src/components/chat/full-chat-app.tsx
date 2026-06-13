"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Folder,
  Library,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Video,
  X,
} from "lucide-react"

import { ChatPartView } from "@/components/chat/tool-parts"
import { SettingsPanel } from "@/components/chat/settings-panel"
import { Markdown } from "@/components/ui/markdown"
import {
  AppSettings,
  Attachment,
  BootstrapPayload,
  ChatMessage,
  ChatPart,
  Thread,
} from "@/lib/querygpt/types"
import { cn } from "@/lib/utils"

type MessagesByThread = Record<string, ChatMessage[]>
type VoiceMode = "none" | "sidebar" | "fullscreen"

const starterPrompts = [
  "Revenue ka monthly trend dikhao",
  "Show the interest to match funnel",
  "Top active-user cities?",
  "Support tickets by category and CSAT",
]

const projectShortcuts = [
  { id: "schema", label: "Schema map", icon: Folder },
  { id: "revenue", label: "Revenue", icon: Sparkles },
  { id: "matches", label: "Match funnel", icon: MessageCircle },
  { id: "support", label: "Support ops", icon: Archive },
]

function dayLabel(dateString: string) {
  const date = new Date(dateString)
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays <= 7) return "Previous 7 days"
  return "Older"
}

function groupThreads(threads: Thread[]) {
  const groups = new Map<string, Thread[]>()
  for (const thread of threads) {
    const label = thread.pinned ? "Pinned" : dayLabel(thread.updatedAt)
    groups.set(label, [...(groups.get(label) ?? []), thread])
  }
  return ["Pinned", "Today", "Yesterday", "Previous 7 days", "Older"]
    .map((label) => ({ label, threads: groups.get(label) ?? [] }))
    .filter((group) => group.threads.length)
}

function firstText(parts: ChatMessage["parts"]) {
  return parts.find((part) => part.type === "text")?.text ?? ""
}

function partsToClipboard(parts: ChatPart[]) {
  return parts
    .map((part) => {
      if (part.type === "text") return part.text
      if (part.type === "sql") return part.sql
      if (part.type === "error") return `${part.title}\n${part.detail ?? ""}`.trim()
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}

function IconButton({
  label,
  children,
  active,
  className,
  onClick,
}: {
  label: string
  children: ReactNode
  active?: boolean
  className?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border-0 text-[var(--color-text-primary)] transition-colors focus:outline-none",
        active ? "bg-[var(--color-sidebar-hover-open)]" : "hover:bg-[var(--color-sidebar-hover-open)]",
        className,
      )}
    >
      {children}
    </button>
  )
}

function SidebarRow({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-[10px] border-0 px-2.5 text-left text-sm leading-5 text-[var(--color-text-primary)] transition-colors focus:outline-none",
        active ? "bg-[var(--color-sidebar-hover-open)]" : "hover:bg-[var(--color-sidebar-hover-open)]",
        className,
      )}
    >
      {children}
    </button>
  )
}

function Section({
  label,
  children,
  defaultOpen = true,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex h-8 w-full items-center gap-1 border-0 px-2 py-1.5 text-left text-sm font-semibold leading-5 text-[var(--color-text-primary)] focus:outline-none"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            "size-4 text-[var(--color-text-secondary)] transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? <div className="flex flex-col">{children}</div> : null}
    </section>
  )
}

function ThreadMenu({
  thread,
  onClose,
  onRename,
  onDelete,
  onTogglePin,
}: {
  thread: Thread | null
  onClose: () => void
  onRename: (thread: Thread) => void
  onDelete: (id: string) => void
  onTogglePin: (thread: Thread) => void
}) {
  useEffect(() => {
    if (!thread) return
    const close = (event: KeyboardEvent | MouseEvent) => {
      if ("key" in event && event.key !== "Escape") return
      onClose()
    }
    window.addEventListener("keydown", close)
    window.addEventListener("click", close)
    return () => {
      window.removeEventListener("keydown", close)
      window.removeEventListener("click", close)
    }
  }, [onClose, thread])

  if (!thread) return null

  const itemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-sidebar-hover-open)] focus:outline-none"

  return (
    <div
      role="menu"
      className="fixed left-[254px] top-[154px] z-[90] w-[190px] rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      onClick={(event) => event.stopPropagation()}
    >
      <button className={itemClass} onClick={() => onRename(thread)}>
        <Pencil className="size-4" />
        Rename
      </button>
      <button className={itemClass} onClick={() => onTogglePin(thread)}>
        {thread.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        {thread.pinned ? "Unpin" : "Pin"}
      </button>
      <button
        className={itemClass}
        onClick={() => {
          const text = `${thread.title}\n${thread.updatedAt}`
          navigator.clipboard.writeText(text)
        }}
      >
        <Copy className="size-4" />
        Copy title
      </button>
      <div className="my-1 h-px bg-[var(--color-sidebar-border)]" />
      <button
        className={cn(itemClass, "text-[var(--color-danger)]")}
        onClick={() => onDelete(thread.id)}
      >
        <Trash2 className="size-4" />
        Delete
      </button>
    </div>
  )
}

function SearchChatsModal({
  open,
  query,
  groups,
  activeId,
  onQueryChange,
  onClose,
  onNewChat,
  onOpenThread,
}: {
  open: boolean
  query: string
  groups: ReturnType<typeof groupThreads>
  activeId: string | null
  onQueryChange: (value: string) => void
  onClose: () => void
  onNewChat: () => void
  onOpenThread: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center bg-black/10 pt-[18vh] backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search chats"
        className="flex h-[min(442px,calc(100vh-48px))] w-[min(680px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--color-sidebar-separator)] bg-[var(--color-settings-bg)] text-[var(--color-text-primary)] shadow-[0_14px_62px_rgba(0,0,0,0.18)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-[53px] shrink-0 items-center gap-2 px-3">
          <Search className="ml-2 size-4 text-[var(--color-text-secondary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats"
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-2 text-base leading-6 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)]"
          />
          <IconButton label="Close" onClick={onClose} className="h-7 w-7 rounded-full">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="h-px shrink-0 bg-[var(--color-sidebar-separator)] opacity-70" />
        <div className="search-chats-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
          <SidebarRow
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="h-11 px-3 text-base"
          >
            <Plus className="size-5" />
            <span>New chat</span>
          </SidebarRow>
          {groups.length === 0 ? (
            <div className="px-3 py-4 text-sm leading-5 text-[var(--color-text-secondary)]">
              {query.trim() ? "No chats match your search." : "No chats yet."}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="flex h-6 items-center px-3 text-[13px] font-medium leading-5 text-[var(--color-text-secondary)]">
                  {group.label}
                </div>
                {group.threads.map((thread) => (
                  <SidebarRow
                    key={thread.id}
                    active={activeId === thread.id}
                    onClick={() => {
                      onOpenThread(thread.id)
                      onClose()
                    }}
                    className="h-11 px-3 text-base"
                  >
                    <span className="truncate">{thread.title}</span>
                  </SidebarRow>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function JarvisSidebar({
  expanded,
  threads,
  activeId,
  searchOpen,
  onToggle,
  onNewChat,
  onSearch,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
}: {
  expanded: boolean
  threads: Thread[]
  activeId: string | null
  searchOpen: boolean
  onToggle: () => void
  onNewChat: () => void
  onSearch: () => void
  onSelect: (id: string) => void
  onRename: (thread: Thread) => void
  onDelete: (id: string) => void
  onTogglePin: (thread: Thread) => void
}) {
  const [menuThread, setMenuThread] = useState<Thread | null>(null)
  const grouped = useMemo(() => groupThreads(threads), [threads])

  if (!expanded) {
    return (
      <aside
        id="sidebar"
        className="relative hidden h-full w-[var(--shell-sidebar-rail-width)] shrink-0 flex-col items-center justify-between overflow-visible bg-[var(--color-bg-sidebar)] py-2 md:flex"
      >
        <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-[var(--color-sidebar-separator)]" />
        <div className="flex flex-col items-center gap-0">
          <IconButton label="Open sidebar" onClick={onToggle}>
            <Bot className="size-5" />
          </IconButton>
          <div className="mt-4 flex flex-col items-center gap-0">
            <IconButton label="New chat" onClick={onNewChat}>
              <Plus className="size-5" />
            </IconButton>
            <IconButton label="Search chats" active={searchOpen} onClick={onSearch}>
              <Search className="size-5" />
            </IconButton>
            <IconButton label="Library">
              <Library className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="mb-1.5 flex h-10 w-[38px] items-center justify-center rounded-[10px] bg-[var(--color-sidebar-hover-open)] text-sm font-semibold">
          NF
        </div>
      </aside>
    )
  }

  return (
    <aside
      id="sidebar"
      className="fixed inset-y-0 left-0 z-[70] flex h-full w-[min(86vw,var(--shell-sidebar-expanded-width))] shrink-0 flex-col overflow-hidden bg-[var(--color-bg-sidebar)] md:relative md:w-[var(--shell-sidebar-expanded-width)]"
    >
      <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-[var(--color-sidebar-separator)]" />
      <div className="shrink-0">
        <div className="flex h-[52px] items-center justify-between px-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-9 items-center rounded-lg border-0 px-2.5 text-left text-base font-semibold leading-6 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-sidebar-hover-open)] focus:outline-none"
          >
            NF QueryGPT
          </button>
          <IconButton label="Close sidebar" onClick={onToggle}>
            <PanelLeft className="size-5" />
          </IconButton>
        </div>
        <div className="px-1.5 pb-3">
          <SidebarRow onClick={onNewChat} active={!activeId}>
            <Plus className="size-5" />
            <span className="truncate">New chat</span>
          </SidebarRow>
          <SidebarRow onClick={onSearch} active={searchOpen}>
            <Search className="size-5" />
            <span className="truncate">Search chats</span>
          </SidebarRow>
          <SidebarRow>
            <Library className="size-5" />
            <span className="truncate">Library</span>
          </SidebarRow>
        </div>
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-3">
        <Section label="Projects">
          {projectShortcuts.map((project) => {
            const Icon = project.icon
            return (
              <SidebarRow key={project.id}>
                <Icon className="size-5 text-[var(--color-text-secondary)]" />
                <span className="truncate">{project.label}</span>
              </SidebarRow>
            )
          })}
        </Section>

        <Section label="Recents">
          {threads.length === 0 ? (
            <div className="px-2.5 py-2 text-sm leading-5 text-[var(--color-text-secondary)]">
              No chats yet. Start a conversation and it will appear here.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="pb-2">
                <div className="px-2.5 pb-1 pt-2 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                  {group.label}
                </div>
                {group.threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "group relative flex h-9 w-full items-center rounded-[10px] px-2.5 text-sm leading-5 text-[var(--color-text-primary)] transition-colors",
                      activeId === thread.id
                        ? "bg-[var(--color-sidebar-hover-open)]"
                        : "hover:bg-[var(--color-sidebar-hover-open)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(thread.id)}
                      onDoubleClick={() => onRename(thread)}
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-sm leading-5 text-[var(--color-text-primary)] focus:outline-none"
                    >
                      <span className="block truncate pr-8">{thread.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setMenuThread(thread)
                      }}
                      className={cn(
                        "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border-0 text-[var(--color-text-secondary)] opacity-0 transition-opacity hover:bg-[var(--color-sidebar-hover-open)] hover:text-[var(--color-text-primary)] focus:opacity-100 focus:outline-none group-hover:opacity-100",
                        activeId === thread.id && "opacity-100",
                      )}
                      aria-label={`Manage ${thread.title}`}
                      title="Options"
                    >
                      <MoreHorizontal className="size-5" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </Section>
      </div>

      <div className="relative shrink-0 bg-[var(--color-bg-sidebar)] px-2 pb-1.5 pt-2">
        <div className="pointer-events-none absolute left-3 right-3 top-0 h-px bg-[var(--color-sidebar-border)]" />
        <button
          type="button"
          className="flex h-[52px] w-full items-center gap-2 rounded-[10px] border-0 px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-sidebar-hover-open)] focus:outline-none"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111] text-xs font-semibold text-white dark:bg-white dark:text-black">
            NF
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium leading-5 text-[var(--color-text-primary)]">
              Buildathon
            </span>
            <span className="truncate text-xs text-[var(--color-text-secondary)]">
              Database analyst
            </span>
          </div>
        </button>
      </div>

      <ThreadMenu
        thread={menuThread}
        onClose={() => setMenuThread(null)}
        onRename={onRename}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
      />
    </aside>
  )
}

function Greeting() {
  return (
    <h1 className="mb-6 -translate-y-2 text-2xl font-normal leading-7 text-[var(--color-text-primary)]">
      What should we ask the NikahForever database?
    </h1>
  )
}

function EmptyChat({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="flex w-full flex-col items-center px-4 text-center">
      <Greeting />
      <div className="grid w-full max-w-[760px] gap-2 sm:grid-cols-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] px-3 py-2.5 text-left text-sm leading-5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-sidebar-hover-open)]"
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
          className="flex items-center gap-2 rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
        >
          <FileText className="size-3.5 text-[var(--color-text-secondary)]" />
          <span className="max-w-44 truncate">{attachment.filename}</span>
          <button
            type="button"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            onClick={() => onRemove(attachment.id)}
          >
            remove
          </button>
        </div>
      ))}
    </div>
  )
}

function AssistantPartView({
  part,
  onClarification,
}: {
  part: ChatPart
  onClarification: (value: string) => void
}) {
  if (part.type === "text") {
    return (
      <Markdown className="jarvis-prose text-base font-normal leading-7 text-[var(--color-text-primary)]">
        {part.text}
      </Markdown>
    )
  }
  return <ChatPartView part={part} onClarification={onClarification} />
}

function ChatMessages({
  messages,
  isLoading,
  onClarification,
}: {
  messages: ChatMessage[]
  isLoading: boolean
  onClarification: (value: string) => void
}) {
  return (
    <div className="flex w-full flex-col pt-[60px]">
      {messages.map((message, index) => {
        const assistant = message.role === "assistant"
        return (
          <div
            key={message.id}
            className={cn(
              "group mx-auto w-full max-w-[800px] px-4",
              assistant ? "py-3" : "flex justify-end py-2",
            )}
          >
            {assistant ? (
              <div className="text-[var(--color-text-primary)]">
                {message.parts.map((part, partIndex) => (
                  <AssistantPartView
                    key={partIndex}
                    part={part}
                    onClarification={onClarification}
                  />
                ))}
              </div>
            ) : (
              <div className="max-w-[75%] break-words rounded-[18px] bg-[#f4f4f4] px-5 py-2.5 text-base font-normal leading-6 text-[var(--color-text-primary)] dark:bg-[#303030]">
                {firstText(message.parts)}
              </div>
            )}

            <div
              className={cn(
                "mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                assistant ? "justify-start" : "justify-end",
                index === messages.length - 1 && "opacity-100",
              )}
            >
              <IconButton
                label="Copy message"
                className="h-7 w-7 text-[var(--color-text-secondary)]"
                onClick={() => navigator.clipboard.writeText(partsToClipboard(message.parts))}
              >
                <Copy className="size-4" />
              </IconButton>
            </div>
          </div>
        )
      })}

      {isLoading ? (
        <div className="mx-auto w-full max-w-[800px] px-4 py-3 text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-2 text-base leading-7">
            <span>Thinking</span>
            <span className="inline-flex gap-1">
              <span className="size-1.5 animate-[loading-dots_1.2s_infinite] rounded-full bg-current" />
              <span className="size-1.5 animate-[loading-dots_1.2s_infinite_150ms] rounded-full bg-current" />
              <span className="size-1.5 animate-[loading-dots_1.2s_infinite_300ms] rounded-full bg-current" />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Header({
  sidebarExpanded,
  settings,
  theme,
  voiceMode,
  onToggleSidebar,
  onToggleTheme,
  onToggleVoicePanel,
  onSettingsChange,
}: {
  sidebarExpanded: boolean
  settings: AppSettings | null
  theme: "light" | "dark"
  voiceMode: VoiceMode
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onToggleVoicePanel: () => void
  onSettingsChange: (settings: AppSettings) => void
}) {
  return (
    <header
      id="top-header"
      className="h-[var(--shell-header-height)] flex items-start justify-between px-2 pt-2 shrink-0 relative z-20 w-full"
    >
      <div
        className="absolute inset-0 right-4 pointer-events-none -z-10"
        style={{
          background: "linear-gradient(180deg, var(--color-bg-main) 20%, transparent 100%)",
        }}
      />
      <div className="flex items-center gap-1">
        <IconButton
          label={sidebarExpanded ? "Close sidebar" : "Open sidebar"}
          onClick={onToggleSidebar}
          className="md:hidden"
        >
          <PanelLeft className="size-5" />
        </IconButton>
        <button
          type="button"
          className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-base font-medium leading-6 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-top-nav-hover)] focus:outline-none"
        >
          <span>NF QueryGPT</span>
          <ChevronDown className="size-4 translate-y-px text-[var(--color-text-secondary)]" />
        </button>
        <span className="hidden rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] px-2 py-1 text-xs text-[var(--color-text-secondary)] sm:inline-flex">
          Main {settings?.mainAgent.model ?? "loading"} / Worker{" "}
          {settings?.workerAgent.model ?? "loading"}
        </span>
      </div>

      <div className="flex items-center gap-1 px-1 text-[var(--color-text-primary)]">
        <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} />
        <IconButton label="Toggle theme" onClick={onToggleTheme}>
          {theme === "dark" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </IconButton>
        <IconButton
          label="Toggle voice panel"
          active={voiceMode === "sidebar"}
          onClick={onToggleVoicePanel}
        >
          <PanelLeft className="size-5 scale-x-[-1]" />
        </IconButton>
      </div>
    </header>
  )
}

function Composer({
  value,
  isLoading,
  pendingAttachments,
  voiceActive,
  voiceMode,
  onValueChange,
  onSend,
  onStop,
  onUpload,
  onRemoveAttachment,
  onVoiceClick,
}: {
  value: string
  isLoading: boolean
  pendingAttachments: Attachment[]
  voiceActive: boolean
  voiceMode: VoiceMode
  onValueChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onUpload: (file: File) => void
  onRemoveAttachment: (id: string) => void
  onVoiceClick: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasText = value.trim().length > 0
  const expanded = value.includes("\n") || value.length > 90

  useEffect(() => {
    const input = textareaRef.current
    if (!input) return
    input.style.height = "auto"
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`
  }, [value])

  return (
    <div className="w-full max-w-[var(--composer-shell-width)] px-4">
      <AttachmentStrip attachments={pendingAttachments} onRemove={onRemoveAttachment} />
      <div
        id="input-wrapper"
        className={cn(
          "relative z-10 w-full rounded-[28px] border-0 bg-[var(--color-bg-composer)] px-2.5 py-2 shadow-[var(--shadow-composer)] transition-[background-color,box-shadow]",
          expanded && "expanded",
        )}
      >
        <div className="flex items-center shrink-0" style={{ gridArea: "leading" }}>
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
          <IconButton label="Add files" className="rounded-full" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="size-5" />
          </IconButton>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (hasText && !isLoading) onSend()
            }
          }}
          placeholder="Ask anything"
          rows={1}
          autoFocus
          className="min-h-9 w-full max-h-[200px] resize-none overflow-y-auto bg-transparent px-2 pb-[7px] pt-[5px] text-base leading-6 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)]"
          style={{ gridArea: "primary" }}
        />

        <div className="flex items-center justify-end gap-1.5 shrink-0" style={{ gridArea: "trailing" }}>
          {isLoading ? (
            <IconButton label="Stop generating" className="rounded-full bg-[#e5e5e5] dark:bg-[#424242]" onClick={onStop}>
              <Square className="size-4" />
            </IconButton>
          ) : hasText ? (
            <button
              type="button"
              onClick={onSend}
              className="group flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-all duration-200 hover:bg-gray-800 focus:outline-none dark:bg-white dark:text-black dark:hover:bg-gray-200"
              aria-label="Send message"
              title="Send message"
            >
              <ArrowUp className="size-5 transition-transform group-active:-translate-y-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onVoiceClick}
              className={cn(
                "group flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 focus:outline-none",
                voiceActive && voiceMode === "sidebar"
                  ? "bg-[#0a84ff]/20 text-[#0a84ff] hover:bg-[#0a84ff]/30"
                  : "bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200",
              )}
              aria-label="Voice input"
              title="Voice"
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function useCallTimer(active: boolean, startedAt: number | null) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [active])

  if (!active || !startedAt || !now) return "00:00"
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

function Visualizer({
  variant = "sidebar",
  muted = false,
}: {
  variant?: "sidebar" | "fullscreen" | "orb"
  muted?: boolean
}) {
  const sizes = {
    sidebar: { width: 240, height: 120, bar: 28, gap: 18, min: 28 },
    fullscreen: { width: 360, height: 200, bar: 40, gap: 24, min: 40 },
    orb: { width: 150, height: 140, bar: 14, gap: 10, min: 14 },
  }[variant]

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: sizes.width, height: sizes.height, gap: sizes.gap }}
    >
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className={cn(
            "nf-voice-bar rounded-full bg-black/80 shadow-[0_0_12px_rgba(0,0,0,0.1)] dark:bg-white dark:shadow-[0_0_12px_rgba(255,255,255,0.1)]",
            muted && "nf-voice-bar-muted",
          )}
          style={
            {
              "--bar-min": `${sizes.min}px`,
              "--bar-max": `${sizes.height * 0.74}px`,
              animationDelay: `${index * 130}ms`,
              width: sizes.bar,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

function VoiceRightPanel({
  mode,
  active,
  connecting,
  connected,
  startedAt,
  muted,
  onStart,
  onEnd,
  onToggleMute,
  onMode,
}: {
  mode: VoiceMode
  active: boolean
  connecting: boolean
  connected: boolean
  startedAt: number | null
  muted: boolean
  onStart: () => void
  onEnd: () => void
  onToggleMute: () => void
  onMode: (mode: VoiceMode) => void
}) {
  const timer = useCallTimer(connected, startedAt)
  const show = mode === "sidebar"

  return (
    <aside
      data-open={show ? "true" : "false"}
      className="voice-right-panel relative z-20 hidden h-full shrink-0 flex-col items-center overflow-hidden border-l border-[var(--color-sidebar-separator)] bg-[var(--color-bg-main)] md:flex"
    >
      <div className="flex h-full w-[320px] flex-col items-center px-4 pb-4">
        <div className="mb-4 flex w-full shrink-0 items-center justify-between border-b border-[var(--color-sidebar-border)] py-3">
          <IconButton label="Expand voice" onClick={() => onMode("fullscreen")}>
            <Maximize2 className="size-[18px]" />
          </IconButton>
          <span className="rounded-full bg-[var(--color-sidebar-hover-open)] px-3 py-1 text-sm font-semibold leading-5 tabular-nums text-[var(--color-text-primary)]">
            {connecting ? "Connecting..." : timer}
          </span>
          <IconButton label="Close voice panel" onClick={() => onMode("none")}>
            <X className="size-[18px]" />
          </IconButton>
        </div>

        <div className="flex w-full flex-1 items-center justify-center">
          <div className="flex h-[260px] w-full items-center justify-center rounded-[28px] border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] shadow-sm">
            <Visualizer variant="sidebar" muted={muted} />
          </div>
        </div>

        <div className="mb-6 flex items-center justify-center gap-3 rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] p-2 shadow-sm">
          <IconButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} active={muted} className={cn("h-11 w-11 rounded-full", muted && "bg-[var(--color-danger)] text-white")}>
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </IconButton>
          <IconButton label="Camera" className="h-11 w-11 rounded-full">
            <Video className="size-5" />
          </IconButton>
          <IconButton label="Screen share" className="h-11 w-11 rounded-full">
            <Monitor className="size-5" />
          </IconButton>
          <IconButton
            label={connected ? "End call" : "Start call"}
            onClick={connected || active ? onEnd : onStart}
            className={cn("h-11 w-11 rounded-full bg-[var(--color-accent)] text-white", active && "bg-[var(--color-danger)]")}
          >
            {active ? <X className="size-5" /> : <Check className="size-5" />}
          </IconButton>
        </div>
      </div>
    </aside>
  )
}

function VoicePicker({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const voices = [
    ["Aoede", "Bright"],
    ["Puck", "Fast"],
    ["Kore", "Calm"],
    ["Orus", "Clear"],
  ]
  const [selected, setSelected] = useState("Orus")

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--color-bg-main)]">
      <h2 className="mb-10 text-2xl font-medium text-[var(--color-text-primary)]">Choose a voice</h2>
      <div className="mb-12 flex h-[140px] w-[140px] items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] shadow-sm">
        <Visualizer variant="orb" />
      </div>
      <div className="mb-14 flex items-center justify-center gap-6">
        {voices.map(([voice, desc]) => (
          <button
            key={voice}
            type="button"
            onClick={() => setSelected(voice)}
            className={cn(
              "flex min-w-20 flex-col items-center transition-all duration-200",
              selected === voice ? "scale-110 opacity-100" : "opacity-45 hover:opacity-75",
            )}
          >
            <span className="text-base font-semibold text-[var(--color-text-primary)]">{voice}</span>
            <span className="text-xs text-[var(--color-accent)]">{desc}</span>
          </button>
        ))}
      </div>
      <div className="flex w-full max-w-[200px] flex-col gap-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-[var(--color-text-primary)] py-3.5 font-medium text-[var(--color-bg-main)] transition-colors hover:brightness-95"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-[var(--color-sidebar-hover-open)] py-3.5 font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-sidebar-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function VoiceFullscreen({
  mode,
  active,
  connecting,
  connected,
  startedAt,
  muted,
  onStart,
  onEnd,
  onToggleMute,
  onMode,
}: {
  mode: VoiceMode
  active: boolean
  connecting: boolean
  connected: boolean
  startedAt: number | null
  muted: boolean
  onStart: () => void
  onEnd: () => void
  onToggleMute: () => void
  onMode: (mode: VoiceMode) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const timer = useCallTimer(connected, startedAt)
  const show = mode === "fullscreen"

  return (
    <>
      <div
        data-open={show && !pickerOpen ? "true" : "false"}
        className="voice-fullscreen-panel fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[var(--color-bg-main)]"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 34%), var(--color-bg-main)",
        }}
      >
        <div className="absolute left-0 top-0 z-50 flex w-full items-center justify-between px-6 py-6">
          <IconButton label="Voice settings" onClick={() => setPickerOpen(true)}>
            <Settings2 className="size-5" />
          </IconButton>
          <span className="rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] px-3 py-1 text-sm font-semibold leading-5 tabular-nums text-[var(--color-text-primary)] shadow-sm">
            {connecting ? "Connecting..." : timer}
          </span>
          <IconButton label="Collapse voice" onClick={() => onMode("sidebar")}>
            <Minimize2 className="size-5" />
          </IconButton>
        </div>

        <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center">
          <div className="flex h-[360px] w-[min(620px,calc(100vw-64px))] items-center justify-center rounded-[36px] border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] shadow-sm">
            <Visualizer variant="fullscreen" muted={muted} />
          </div>
        </div>

        <div className="mb-[60px] flex items-center justify-center gap-4 rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] p-3 shadow-sm">
          <IconButton label="Camera" className="h-[72px] w-[72px] rounded-full">
            <Video className="size-7" />
          </IconButton>
          <IconButton
            label={muted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
            className={cn("h-[72px] w-[72px] rounded-full", muted && "bg-[var(--color-danger)] text-white")}
          >
            {muted ? <MicOff className="size-7" /> : <Mic className="size-7" />}
          </IconButton>
          <IconButton label="Screen share" className="h-[72px] w-[72px] rounded-full">
            <Monitor className="size-7" />
          </IconButton>
          <IconButton
            label={active ? "End call" : "Start call"}
            onClick={active ? onEnd : onStart}
            className={cn("h-[72px] w-[72px] rounded-full bg-[var(--color-accent)] text-white", active && "bg-[var(--color-danger)]")}
          >
            {active ? <X className="size-7" /> : <Check className="size-7" />}
          </IconButton>
        </div>
      </div>
      <VoicePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  )
}

function ChatArea({
  activeThread,
  messages,
  settings,
  isLoading,
  pendingAttachments,
  prompt,
  voiceActive,
  voiceMode,
  onPromptChange,
  onSend,
  onStop,
  onUpload,
  onRemoveAttachment,
  onVoiceClick,
}: {
  activeThread: Thread | null
  messages: ChatMessage[]
  settings: AppSettings | null
  isLoading: boolean
  pendingAttachments: Attachment[]
  prompt: string
  voiceActive: boolean
  voiceMode: VoiceMode
  onPromptChange: (value: string) => void
  onSend: (value?: string) => void
  onStop: () => void
  onUpload: (file: File) => void
  onRemoveAttachment: (id: string) => void
  onVoiceClick: () => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const isThreadEmpty = messages.length === 0

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      setShowScrollDown(distance > 160)
    }
    update()
    viewport.addEventListener("scroll", update, { passive: true })
    return () => viewport.removeEventListener("scroll", update)
  }, [])

  useEffect(() => {
    scrollToBottom("auto")
  }, [messages.length, isLoading, scrollToBottom])

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg-main)] transition-colors">
      <div
        ref={viewportRef}
        className="chat-scrollbar absolute inset-0 z-0 flex w-full flex-col overflow-y-auto"
      >
        <div className={cn("flex w-full flex-1 flex-col transition-opacity duration-300", isThreadEmpty ? "opacity-0" : "opacity-100")}>
          {!isThreadEmpty ? (
            <>
              <ChatMessages messages={messages} isLoading={isLoading} onClarification={(value) => onSend(value)} />
              <div className="shrink-0" style={{ height: 132 }} />
            </>
          ) : null}
        </div>
      </div>

      {!isThreadEmpty && showScrollDown ? (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-[108px] left-1/2 z-30 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)] shadow-sm hover:bg-[var(--color-top-nav-hover)] focus:outline-none"
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
        >
          <ArrowDown className="size-[18px]" />
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex w-full flex-col pr-0 md:pr-4">
        <div
          className="w-full shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{
            height: isThreadEmpty ? "calc(35vh - 8px)" : "0px",
            flexGrow: isThreadEmpty ? 0 : 1,
          }}
        />

        <div
          className={cn(
            "pointer-events-auto flex w-full shrink-0 justify-center transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
            isThreadEmpty ? "max-h-[220px] opacity-100" : "max-h-0 overflow-hidden opacity-0",
          )}
        >
          {isThreadEmpty ? <EmptyChat onSelect={(value) => onSend(value)} /> : null}
        </div>

        <div className="pointer-events-auto relative flex w-full shrink-0 justify-center pb-5">
          <div
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-[var(--color-bg-main)] transition-opacity duration-300 md:right-4",
              isThreadEmpty ? "opacity-0" : "opacity-100",
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-12 left-0 right-0 h-7 transition-opacity duration-300 md:right-4",
              isThreadEmpty ? "opacity-0" : "opacity-100",
            )}
            style={{ background: "linear-gradient(to top, var(--color-bg-main) 0%, transparent 100%)" }}
          />
          <Composer
            value={prompt}
            isLoading={isLoading}
            pendingAttachments={pendingAttachments}
            voiceActive={voiceActive}
            voiceMode={voiceMode}
            onValueChange={onPromptChange}
            onSend={() => onSend()}
            onStop={onStop}
            onUpload={onUpload}
            onRemoveAttachment={onRemoveAttachment}
            onVoiceClick={onVoiceClick}
          />
        </div>

        <div
          className="shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{
            flexGrow: isThreadEmpty ? 1 : 0,
            height: isThreadEmpty ? "auto" : "0px",
          }}
        />
      </div>

      <div className="sr-only">
        Current chat: {activeThread?.title ?? "New chat"}. Main agent:{" "}
        {settings?.mainAgent.model ?? "loading"}.
      </div>
    </main>
  )
}

export function FullChatApp() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [messagesByThread, setMessagesByThread] = useState<MessagesByThread>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [prompt, setPrompt] = useState("")
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("none")
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceConnecting, setVoiceConnecting] = useState(false)
  const [voiceConnected, setVoiceConnected] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null)
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
        const stored = window.localStorage.getItem("theme")
        const nextTheme =
          stored === "light" || stored === "dark"
            ? stored
            : payload.settings.theme === "light"
              ? "light"
              : "dark"
        setTheme(nextTheme)
      })
      .catch(() => {
        if (mounted) {
          setThreads([])
          setMessagesByThread({})
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    window.localStorage.setItem("theme", theme)
  }, [theme])

  useEffect(() => {
    if (!voiceConnecting) return
    const id = window.setTimeout(() => {
      setVoiceConnecting(false)
      setVoiceConnected(true)
    }, 650)
    return () => window.clearTimeout(id)
  }, [voiceConnecting])

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null
  const messages = activeId ? messagesByThread[activeId] ?? [] : []

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const items = query
      ? threads.filter((thread) => thread.title.toLowerCase().includes(query))
      : threads
    return groupThreads(items)
  }, [searchQuery, threads])

  const newChat = () => {
    setActiveId(null)
    setPrompt("")
    setSidebarExpanded(false)
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
    const thread = threads.find((item) => item.id === id)
    const confirmed = window.confirm(`Delete "${thread?.title ?? "this chat"}"? This cannot be undone.`)
    if (!confirmed) return
    await fetch(`/api/threads/${id}`, { method: "DELETE" })
    setThreads((current) => current.filter((item) => item.id !== id))
    setMessagesByThread((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (activeId === id) setActiveId(null)
  }

  const send = async (value?: string) => {
    const text = (value ?? prompt).trim()
    if (!text || isLoading) return
    setPrompt("")
    setIsLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: activeId ?? undefined,
          message: text,
          provider: activeThread?.provider ?? settings?.mainAgent.provider,
          model: activeThread?.model ?? settings?.mainAgent.model,
          attachmentIds: pendingAttachments.map((attachment) => attachment.id),
        }),
        signal: controller.signal,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? "Chat request failed")
      }
      setThreads((current) => {
        const exists = current.some((thread) => thread.id === payload.thread.id)
        const next = exists
          ? current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread))
          : [payload.thread, ...current]
        return next.sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.updatedAt.localeCompare(a.updatedAt),
        )
      })
      setMessagesByThread((current) => ({
        ...current,
        [payload.thread.id]: payload.messages,
      }))
      setActiveId(payload.thread.id)
      setPendingAttachments([])
      setSidebarExpanded(false)
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : "Chat request failed"
      const fallbackThreadId = activeId ?? "local-error"
      const now = new Date().toISOString()
      const userMessage: ChatMessage = {
        id: `local-user-${Date.now()}`,
        threadId: fallbackThreadId,
        role: "user",
        parts: [{ type: "text", text }],
        status: "ready",
        createdAt: now,
      }
      const assistantMessage: ChatMessage = {
        id: `local-error-${Date.now()}`,
        threadId: fallbackThreadId,
        role: "assistant",
        parts: [{ type: "error", title: "Chat failed", detail: message }],
        status: "error",
        createdAt: now,
      }
      if (activeId) {
        setMessagesByThread((current) => ({
          ...current,
          [activeId]: [...(current[activeId] ?? []), userMessage, assistantMessage],
        }))
      } else {
        setMessagesByThread((current) => ({
          ...current,
          [fallbackThreadId]: [userMessage, assistantMessage],
        }))
        setActiveId(fallbackThreadId)
      }
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

  const startVoice = () => {
    setVoiceMode((current) => (current === "none" ? "sidebar" : current))
    setVoiceActive(true)
    setVoiceConnecting(true)
    setVoiceConnected(false)
    setVoiceStartedAt(Date.now())
  }

  const endVoice = () => {
    setVoiceActive(false)
    setVoiceConnecting(false)
    setVoiceConnected(false)
    setVoiceStartedAt(null)
  }

  const voiceClick = () => {
    if (!voiceActive) {
      startVoice()
      return
    }
    if (voiceMode === "sidebar") {
      setVoiceMode("none")
    } else {
      setVoiceMode("sidebar")
    }
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-[var(--color-bg-main)] text-[var(--color-text-primary)] antialiased transition-colors">
      {sidebarExpanded ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-[60] bg-black/10 md:hidden"
          onClick={() => setSidebarExpanded(false)}
        />
      ) : null}
      <div className="flex h-full w-full overflow-hidden">
        <JarvisSidebar
          expanded={sidebarExpanded}
          threads={threads}
          activeId={activeId}
          searchOpen={searchOpen}
          onToggle={() => setSidebarExpanded((value) => !value)}
          onNewChat={newChat}
          onSearch={() => setSearchOpen(true)}
          onSelect={(id) => {
            setActiveId(id)
            setSidebarExpanded(false)
          }}
          onRename={renameThread}
          onDelete={deleteThreadById}
          onTogglePin={(thread) => patchThread(thread.id, { pinned: !thread.pinned })}
        />

        <div className="relative flex h-full min-w-0 flex-1 flex-col">
          <ChatArea
            activeThread={activeThread}
            messages={messages}
            settings={settings}
            isLoading={isLoading}
            pendingAttachments={pendingAttachments}
            prompt={prompt}
            voiceActive={voiceActive}
            voiceMode={voiceMode}
            onPromptChange={setPrompt}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            onUpload={upload}
            onRemoveAttachment={(id) =>
              setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id))
            }
            onVoiceClick={voiceClick}
          />

          <div className="pointer-events-none absolute left-0 top-0 z-30 w-full">
            <div className="pointer-events-auto w-full">
              <Header
                sidebarExpanded={sidebarExpanded}
                settings={settings}
                theme={theme}
                voiceMode={voiceMode}
                onToggleSidebar={() => setSidebarExpanded((value) => !value)}
                onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                onToggleVoicePanel={() =>
                  setVoiceMode((current) => (current === "sidebar" ? "none" : "sidebar"))
                }
                onSettingsChange={setSettings}
              />
            </div>
          </div>
        </div>

        <VoiceRightPanel
          mode={voiceMode}
          active={voiceActive}
          connecting={voiceConnecting}
          connected={voiceConnected}
          startedAt={voiceStartedAt}
          muted={voiceMuted}
          onStart={startVoice}
          onEnd={endVoice}
          onToggleMute={() => setVoiceMuted((value) => !value)}
          onMode={setVoiceMode}
        />
      </div>

      <SearchChatsModal
        open={searchOpen}
        query={searchQuery}
        groups={filteredThreads}
        activeId={activeId}
        onQueryChange={setSearchQuery}
        onClose={() => {
          setSearchOpen(false)
          setSearchQuery("")
        }}
        onNewChat={newChat}
        onOpenThread={(id) => setActiveId(id)}
      />

      <VoiceFullscreen
        mode={voiceMode}
        active={voiceActive}
        connecting={voiceConnecting}
        connected={voiceConnected}
        startedAt={voiceStartedAt}
        muted={voiceMuted}
        onStart={startVoice}
        onEnd={endVoice}
        onToggleMute={() => setVoiceMuted((value) => !value)}
        onMode={setVoiceMode}
      />
    </div>
  )
}
