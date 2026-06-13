import crypto from "node:crypto"
import fs from "node:fs"

import { getAppSettings } from "../src/lib/server/app-db"
import { datasetDbPath } from "../src/lib/server/paths"
import { runReadonlyQuery, validateReadonlySql } from "../src/lib/server/sql-gateway"

const hash = crypto.createHash("sha256").update(fs.readFileSync(datasetDbPath)).digest("hex")
const users = runReadonlyQuery({ sql: "SELECT COUNT(*) AS users FROM users" })
let blocked = false
try {
  validateReadonlySql("DROP TABLE users")
} catch {
  blocked = true
}

const settings = getAppSettings()

console.log(
  JSON.stringify(
    {
      dataset: datasetDbPath,
      sha256: hash,
      users: users.rows[0]?.users,
      readonlyBlockedMutation: blocked,
      providers: settings.providers.map((provider) => ({
        id: provider.id,
        configured: provider.keyConfigured,
        keyHint: provider.keyHint,
      })),
      mainAgent: settings.mainAgent,
      workerAgent: settings.workerAgent,
    },
    null,
    2,
  ),
)
