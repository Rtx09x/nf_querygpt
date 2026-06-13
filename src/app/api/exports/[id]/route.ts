import { NextRequest, NextResponse } from "next/server"

import { getExport } from "@/lib/server/app-db"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, context: Context) {
  const { id } = await context.params
  const item = getExport(id)
  if (!item) {
    return NextResponse.json({ error: "Export not found or expired" }, { status: 404 })
  }

  const body =
    item.format === "csv" && typeof item.payload === "string"
      ? item.payload
      : JSON.stringify(item.payload, null, 2)
  return new NextResponse(body, {
    headers: {
      "content-type": item.format === "csv" ? "text/csv" : "application/json",
      "content-disposition": `attachment; filename="${item.filename}"`,
    },
  })
}
