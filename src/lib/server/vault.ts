import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import fs from "node:fs"

import {
  deleteCredential,
  getEncryptedCredential,
  storeEncryptedCredential,
} from "@/lib/server/app-db"
import { ensureDataDirs, masterKeyPath } from "@/lib/server/paths"
import { ProviderId } from "@/lib/querygpt/types"

function getMasterKey() {
  const fromEnv = process.env.NF_QUERYGPT_MASTER_KEY
  if (fromEnv && fromEnv.trim().length >= 32) {
    return createHash("sha256").update(fromEnv).digest()
  }

  ensureDataDirs()
  const keyPath = masterKeyPath()
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64")
  }

  const key = randomBytes(32)
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 })
  return key
}

function hintForKey(key: string) {
  const trimmed = key.trim()
  if (trimmed.length <= 10) return "configured"
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

export function saveApiKey(provider: ProviderId, apiKey: string) {
  const clean = apiKey.trim()
  if (clean.length < 12) {
    throw new Error("API key is too short.")
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv)
  cipher.setAAD(Buffer.from(provider))
  const ciphertext = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  storeEncryptedCredential({
    provider,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyHint: hintForKey(clean),
  })
}

export function removeApiKey(provider: ProviderId) {
  deleteCredential(provider)
}

export function loadApiKey(provider: ProviderId) {
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY
  }
  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
    if (key) return key
  }

  const encrypted = getEncryptedCredential(provider)
  if (!encrypted) return null

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMasterKey(),
    Buffer.from(encrypted.iv, "base64"),
  )
  decipher.setAAD(Buffer.from(provider))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
