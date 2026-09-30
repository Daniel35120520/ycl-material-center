import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { clearSessionCookie, ensureAuthTables, getCookie, sha256 } from "../_shared";

export async function POST(request: Request) {
  await ensureAuthTables();
  const token = getCookie(request);
  if (token) await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE token_hash = ?").bind(await sha256(token)).run();
  return clearSessionCookie(NextResponse.json({ ok: true }));
}

