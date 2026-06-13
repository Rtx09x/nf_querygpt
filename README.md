# NF QueryGPT

Ask the NikahForever hackathon database questions in English or Hinglish.

The app is a local-first two-agent analytics chat:

```text
User prompt
  -> Main agent: intent, cleaned worker prompt, direct/clarify/database route
  -> Worker agent: read-only SQL planning for database tasks
  -> SQL gateway: validates and executes safe SQLite SELECT/CTE only
  -> Main agent: final user-facing answer
  -> Prompt Kit chat UI with SQL, chart, table, stats, exports
```

If no provider key is available, common database demo prompts still run through deterministic templates. If `GEMINI_API_KEY` or `GOOGLE_API_KEY` is present, Gemini is used for the worker agent by default.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional env:

```powershell
$env:GEMINI_API_KEY="..."
$env:OPENAI_API_KEY="..."
$env:NF_QUERYGPT_DATA_DIR="E:\personal\NF_QueryGPT\data"
$env:NF_QUERYGPT_MASTER_KEY="a-long-local-secret"
```

Keys can also be added later from Settings. Stored keys are encrypted locally with AES-256-GCM and are never returned to the browser after saving.

## What Is Included

- Prompt Kit/Zola-style full chat shell.
- Saved chats with history, rename, pin, delete, and search.
- Main-agent and worker-agent provider/model/reasoning settings.
- OpenAI and Gemini provider support.
- Environment-key fallback for smoke tests.
- Read-only SQLite gateway for the supplied dataset.
- Generated SQL transparency.
- Tool UI-style inline progress, stats, charts, tables, clarification, errors, and CSV export.
- Image/PDF/CSV uploads with local storage and text preview context.
- Local app DB for chats/settings/runs/exports.

## Dataset

Committed hackathon assets:

- `dataset/nf_buildathon.db`
- `dataset/schema.sql`
- `dataset/csv/*.csv`
- `dataset/seed.py`
- `querygpt-dataset-kit.zip`

Database shape:

- 12 tables
- 42,461 records
- users, profiles, partner preferences, plans, subscriptions, payments, interests, matches, messages, profile views, reports, support tickets
- current data window: January 2023 through June 11, 2026

Writable app state is separate and ignored by git:

```text
data/app.db
data/uploads/
data/workspaces/
data/.master-key
```

## Verify

```powershell
npm run typecheck
npm run lint
npm run test
npm run preflight
npm run build
```

`npm run preflight` prints the dataset hash, user count, provider configured status, and confirms mutation SQL is blocked.

## Security Boundaries

- Database execution is read-only only.
- SQL must be one `SELECT` or `WITH` statement.
- Mutations, DDL, PRAGMA, ATTACH/DETACH, transactions, and extensions are rejected.
- Query results can include PII if the user asks; operational logs do not store row data.
- Provider calls send selected chat context/results to the configured provider.
- This is a local demo app. Public deployment needs a different persistence/secrets architecture.
