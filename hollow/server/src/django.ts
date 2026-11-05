/** Связь с Django: проверка пропусков игроков и подписанные отчёты о забеге. */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.HOLLOW_SECRET || "";
const DJANGO_URL = (process.env.DJANGO_URL || "https://flower0.pythonanywhere.com").replace(/\/$/, "");

export interface TokenPayload {
  char: number;
  name: string;
  user: string;
  data: unknown;
  exp: number;
}

const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

export function verifyToken(token: string): TokenPayload | null {
  if (!SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const raw = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const want = sign(raw);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as TokenPayload;
    if (!p.exp || p.exp * 1000 < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function report<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const raw = JSON.stringify({ ...body, ts: Math.floor(Date.now() / 1000) });
  const res = await fetch(`${DJANGO_URL}/world/api/coop/report/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hollow-Sig": sign(raw) },
    body: raw,
  });
  let data: { ok?: boolean; error?: string } & T;
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error(`Django ответил ${res.status}`);
  }
  if (!data.ok) throw new Error(data.error || `Django ответил ${res.status}`);
  return data;
}

export const configured = () => !!SECRET;
