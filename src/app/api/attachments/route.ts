import { randomUUID, createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { parse as parseCsv } from "csv-parse/sync"
import { PDFParse } from "pdf-parse"
import { NextRequest, NextResponse } from "next/server"

import { addAttachment } from "@/lib/server/app-db"
import { uploadsDir } from "@/lib/server/paths"

export const runtime = "nodejs"

function kindFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image" as const
  if (mimeType === "application/pdf") return "pdf" as const
  if (mimeType.includes("csv") || mimeType === "text/plain") return "csv" as const
  return "other" as const
}

async function previewFor(buffer: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer })
    try {
      const parsed = await parser.getText()
      return parsed.text.replace(/\s+/g, " ").trim().slice(0, 6000)
    } finally {
      await parser.destroy()
    }
  }

  if (mimeType.includes("csv") || mimeType === "text/plain") {
    const text = buffer.toString("utf8")
    try {
      const rows = parseCsv(text, { columns: true, skip_empty_lines: true }).slice(0, 8)
      return JSON.stringify(rows, null, 2).slice(0, 6000)
    } catch {
      return text.slice(0, 6000)
    }
  }

  return undefined
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const kind = kindFor(file.type)
  const maxSize =
    kind === "pdf" ? 20 * 1024 * 1024 : kind === "csv" ? 5 * 1024 * 1024 : 10 * 1024 * 1024
  if (bytes.length > maxSize) {
    return NextResponse.json({ error: "File is too large for this attachment type." }, { status: 400 })
  }

  await fs.mkdir(uploadsDir(), { recursive: true })
  const id = randomUUID()
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const safeName = file.name.replace(/[^\w.\- ]/g, "_")
  const localPath = path.join(uploadsDir(), `${id}-${safeName}`)
  await fs.writeFile(localPath, bytes)

  const attachment = addAttachment({
    id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: bytes.length,
    kind,
    sha256,
    localPath,
    textPreview: await previewFor(bytes, file.type),
  })

  return NextResponse.json({
    attachment: {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      sha256: attachment.sha256,
      textPreview: attachment.textPreview,
      createdAt: attachment.createdAt,
    },
  })
}
