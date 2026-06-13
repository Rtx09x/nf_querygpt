# NF QueryGPT

AI chat interface for asking the NikahForever SQLite dataset questions in
English or Hinglish.

The frontend uses the Prompt Kit full chat app pattern with shadcn/ui, React,
Tailwind CSS, and Next.js.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

## Dataset

- `dataset/nf_buildathon.db`: SQLite database
- `dataset/schema.sql`: schema
- `dataset/seed.py`: deterministic generator
- `dataset/csv/`: table exports
- `querygpt-dataset-kit.zip`: original supplied archive

Current UI responses are mocked. The read-only natural-language-to-SQL backend
is the next implementation stage.
