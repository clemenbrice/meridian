# Meridian — Commerce Media Intelligence Platform

## Auto-Approvals
The following actions are pre-approved — no confirmation needed:
- Edit and write files in this project
- Run bash commands (npm run build, npm run dev, git commands)
- Install npm packages
- Railway CLI or deployment commands

## Tech Stack
- Next.js 14 (App Router, TypeScript, Tailwind CSS)
- SQLite via better-sqlite3 (WAL mode, file at DATA_DIR/meridian.db)
- Recharts for all charts/visualisations
- Claude API (`claude-sonnet-4-20250514`) for AI insights
- Deployed on Railway (GitHub auto-deploy on push to main)

## Key Commands
```bash
npm run build   # verify TypeScript before committing
npm run dev     # local dev server on :3000
git push        # triggers Railway redeploy
```

## Architecture Notes
- All DB access is synchronous (better-sqlite3) — no async/await in lib/db.ts
- INSERT OR IGNORE deduplication on (campaign_name, date, network)
- ALTER TABLE migrations run at startup via runMigrations() — safe to redeploy
- Railway has no persistent volume — data is ephemeral per container restart

## Safe Environment
Local development + Railway staging. No production user data.
