"use client";

import { useMemo, useState } from "react";
import {
  ArrowUp,
  Copy,
  Database,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { ScrollButton } from "@/components/ui/scroll-button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import {
  ChatMessage,
  conversationGroups,
  promptSuggestions,
  welcomeMessage,
} from "./chat-data";

function ChatSidebar({
  activeId,
  onSelect,
  onNewChat,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-3 py-3">
        <div className="flex h-9 items-center justify-between">
          <div className="flex items-center gap-2 px-1">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Database className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">NF QueryGPT</div>
              <div className="text-xs text-muted-foreground">
                42,461 rows connected
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Search chats">
            <Search className="size-4" />
          </Button>
        </div>
        <Button className="mt-3 w-full justify-start" onClick={onNewChat}>
          <Plus className="size-4" />
          New chat
        </Button>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        {conversationGroups.map((group) => (
          <SidebarGroup key={group.period}>
            <SidebarGroupLabel>{group.period}</SidebarGroupLabel>
            <SidebarMenu>
              {group.conversations.map((conversation) => (
                <SidebarMenuButton
                  key={conversation.id}
                  isActive={activeId === conversation.id}
                  onClick={() => onSelect(conversation.id)}
                >
                  <span>{conversation.title}</span>
                </SidebarMenuButton>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function EmptyChat({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
      <div className="mb-8 flex size-11 items-center justify-center rounded-lg border bg-card">
        <Sparkles className="size-5 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold">Ask the database directly</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        Query users, matches, engagement, revenue, safety, and support in plain
        English or Hinglish.
      </p>
      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        {promptSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="min-h-16 rounded-lg border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatContent({
  title,
  messages,
  setMessages,
}: {
  title: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (suggestedPrompt?: string) => {
    const value = (suggestedPrompt ?? prompt).trim();
    if (!value || isLoading) return;

    setPrompt("");
    setIsLoading(true);
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content: value },
    ]);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            "The chat UI is ready. Next we will connect this request to the read-only SQLite query pipeline and return the answer, generated SQL, and result visualization.",
        },
      ]);
      setIsLoading(false);
    }, 650);
  };

  return (
    <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Read-only
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {messages.length === 0 ? (
          <EmptyChat onSelect={handleSubmit} />
        ) : (
          <ChatContainerRoot className="h-full w-full">
            <ChatContainerContent className="gap-7 px-4 py-8 md:px-6">
              {messages.map((message, index) => {
                const assistant = message.role === "assistant";
                return (
                  <Message
                    key={message.id}
                    className={cn(
                      "group mx-auto w-full max-w-3xl flex-col gap-1",
                      assistant ? "items-start" : "items-end",
                    )}
                  >
                    <MessageContent
                      markdown={assistant}
                      className={cn(
                        assistant
                          ? "w-full bg-transparent p-0 leading-7"
                          : "max-w-[85%] rounded-lg bg-primary px-4 py-2.5 text-primary-foreground",
                      )}
                    >
                      {message.content}
                    </MessageContent>
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
                        >
                          <Copy className="size-4" />
                        </Button>
                      </MessageAction>
                      {assistant && (
                        <>
                          <MessageAction tooltip="Helpful">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Helpful"
                            >
                              <ThumbsUp className="size-4" />
                            </Button>
                          </MessageAction>
                          <MessageAction tooltip="Not helpful">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Not helpful"
                            >
                              <ThumbsDown className="size-4" />
                            </Button>
                          </MessageAction>
                        </>
                      )}
                    </MessageActions>
                  </Message>
                );
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
          <PromptInput
            isLoading={isLoading}
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => handleSubmit()}
            className="rounded-lg border bg-card p-0 shadow-sm"
          >
            <PromptInputTextarea
              placeholder="Ask about users, matches, revenue..."
              className="min-h-12 px-4 pt-3 text-base"
            />
            <PromptInputActions className="justify-between px-3 pb-3 pt-2">
              <span className="rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                English + Hinglish
              </span>
              <div className="flex items-center gap-1">
                <PromptInputAction tooltip="More options">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </PromptInputAction>
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={!prompt.trim() || isLoading}
                  onClick={() => handleSubmit()}
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </PromptInputActions>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Generated SQL and database execution will be added next.
          </p>
        </div>
      </div>
    </main>
  );
}

export function FullChatApp() {
  const conversations = useMemo(
    () => conversationGroups.flatMap((group) => group.conversations),
    [],
  );
  const [activeId, setActiveId] = useState("new");
  const [title, setTitle] = useState("New database question");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);

  const selectConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;
    setActiveId(id);
    setTitle(conversation.title);
    setMessages(
      conversation.messages.length ? conversation.messages : [welcomeMessage],
    );
  };

  const newChat = () => {
    setActiveId("new");
    setTitle("New database question");
    setMessages([]);
  };

  return (
    <SidebarProvider>
      <ChatSidebar
        activeId={activeId}
        onSelect={selectConversation}
        onNewChat={newChat}
      />
      <SidebarInset>
        <ChatContent
          title={title}
          messages={messages}
          setMessages={setMessages}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
