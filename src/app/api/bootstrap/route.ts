import { NextResponse } from "next/server"

import {
  getAppSettings,
  listMessages,
  listThreads,
} from "@/lib/server/app-db"
import { schemaSummary } from "@/lib/server/schema-catalog"

export const runtime = "nodejs"

export async function GET() {
  const threads = listThreads()
  const messagesByThread = Object.fromEntries(
    threads.map((thread) => [thread.id, listMessages(thread.id)]),
  )

  return NextResponse.json({
    settings: getAppSettings(),
    threads,
    messagesByThread,
    schemaSummary: schemaSummary(),
  })
}
