import { sql } from '@vercel/postgres';

export async function logActivity(wallet: string | null, action: string, details: Record<string, any>, site: string) {
  try {
    await sql`CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY, wallet_address TEXT, action TEXT NOT NULL,
      details JSONB, site TEXT NOT NULL, created_at BIGINT NOT NULL
    )`;
    await sql`INSERT INTO activity (wallet_address, action, details, site, created_at)
      VALUES (${wallet?.toLowerCase() || null}, ${action}, ${JSON.stringify(details)}, ${site}, ${Date.now()})`;
  } catch {}
}
