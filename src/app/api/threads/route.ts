import { NextRequest, NextResponse } from "next/server"

import { createThread, listMessages, listThreads } from "@/lib/server/app-db"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ threads: listThreads() })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    provider?: "openai" | "gemini"
    model?: string
  }
  const thread = createThread(body)
  return NextResponse.json({ thread, messages: listMessages(thread.id) })
}
