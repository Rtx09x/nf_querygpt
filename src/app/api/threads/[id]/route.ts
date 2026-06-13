import { NextRequest, NextResponse } from "next/server"

import {
  deleteThread,
  getThread,
  listMessages,
  updateThread,
} from "@/lib/server/app-db"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, context: Context) {
  const { id } = await context.params
  const thread = getThread(id)
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 })
  }
  return NextResponse.json({ thread, messages: listMessages(id) })
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const thread = updateThread(id, body)
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 })
  }
  return NextResponse.json({ thread, messages: listMessages(id) })
}

export async function DELETE(_: NextRequest, context: Context) {
  const { id } = await context.params
  deleteThread(id)
  return NextResponse.json({ ok: true })
}
