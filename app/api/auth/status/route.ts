import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureAuthTables, getCurrentUser, publicUser } from "../_shared";

export async function GET(request: Request) {
  await ensureAuthTables();
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const user = await getCurrentUser(request);
  return NextResponse.json({ initialized: Number(count?.count || 0) > 0, user: user ? publicUser(user) : null });
}

