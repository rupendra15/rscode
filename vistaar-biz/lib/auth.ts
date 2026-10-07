import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type VistaarRole = "admin" | "manager" | "user";

export type AuthContext = {
  userId: string;
  name: string;
  email: string;
  role: VistaarRole;
  accessToken: string;
};

const SESSION_COOKIE = "vistaar_session";
const SESSION_DAYS = 30;

function databaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Vistaar database is not configured.");
  return { url, key };
}

function headers(key: string, extra?: Record<string,string>) {
  return { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...extra };
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function passwordMatches(password: string, salt: string, storedHash: string) {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function setSession(userId: string) {
  const { url, key } = databaseConfig();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(url + "/rest/v1/app_sessions", {
    method: "POST",
    headers: headers(key, { Prefer: "return=minimal" }),
    body: JSON.stringify({ user_id: userId, token_hash: hashSessionToken(token), expires_at: expires }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Could not create your login session.");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { url, key } = databaseConfig();
      await fetch(url + "/rest/v1/app_sessions?token_hash=eq." + encodeURIComponent(hashSessionToken(token)), {
        method: "DELETE",
        headers: headers(key),
        cache: "no-store"
      });
    } catch {}
  }
  jar.delete(SESSION_COOKIE);
}

async function findUserById(userId: string) {
  const { url, key } = databaseConfig();
  const response = await fetch(url + "/rest/v1/app_users?id=eq." + encodeURIComponent(userId) + "&select=id,name,email,role,status&limit=1", {
    headers: headers(key),
    cache: "no-store"
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0] || null;
}

async function findUserByEmail(email: string) {
  const { url, key } = databaseConfig();
  const response = await fetch(url + "/rest/v1/app_users?email=eq." + encodeURIComponent(email) + "&select=id,name,email,password_hash,password_salt,role,status&limit=1", {
    headers: headers(key),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Could not reach the Vistaar database.");
  const rows = await response.json();
  return rows?.[0] || null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { url, key } = databaseConfig();
    const sessionResponse = await fetch(
      url + "/rest/v1/app_sessions?token_hash=eq." + encodeURIComponent(hashSessionToken(token)) +
      "&expires_at=gt." + encodeURIComponent(new Date().toISOString()) +
      "&select=user_id&limit=1",
      { headers: headers(key), cache: "no-store" }
    );
    if (!sessionResponse.ok) return null;
    const sessions = await sessionResponse.json();
    const session = sessions?.[0];
    if (!session?.user_id) return null;

    const user = await findUserById(session.user_id);
    if (!user || user.status !== "active") return null;
    if (user.role !== "admin" && user.role !== "manager" && user.role !== "user") return null;

    await fetch(url + "/rest/v1/app_sessions?token_hash=eq." + encodeURIComponent(hashSessionToken(token)), {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      cache: "no-store"
    }).catch(() => {});

    return { userId: user.id, name: user.name, email: user.email, role: user.role, accessToken: token };
  } catch {
    return null;
  }
}

export async function requireRole(roles: VistaarRole[]): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new Error("UNAUTHENTICATED");
  if (!roles.includes(context.role)) throw new Error("FORBIDDEN");
  return context;
}

export async function signIn(email: string, password: string) {
  if (!email || !password) throw new Error("Email and password are required.");
  const user = await findUserByEmail(email.toLowerCase());
  if (!user || !passwordMatches(password, user.password_salt, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }
  if (user.status !== "active") throw new Error("This account is disabled. Please contact Vistaar.");
  const { url, key } = databaseConfig();
  await fetch(url + "/rest/v1/app_users?id=eq." + encodeURIComponent(user.id), {
    method: "PATCH",
    headers: headers(key, { Prefer: "return=minimal" }),
    body: JSON.stringify({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    cache: "no-store"
  });
  await setSession(user.id);
  return { id: user.id, email: user.email, role: user.role };
}

export async function signUp(email: string, password: string, name?: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name || "").trim();
  if (!cleanName) throw new Error("Name is required.");
  if (!cleanEmail) throw new Error("Email is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const existing = await findUserByEmail(cleanEmail);
  if (existing) throw new Error("An account with this email already exists. Please sign in.");

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const { url, key } = databaseConfig();
  const response = await fetch(url + "/rest/v1/app_users", {
    method: "POST",
    headers: headers(key, { Prefer: "return=representation" }),
    body: JSON.stringify({
      name: cleanName,
      email: cleanEmail,
      password_hash: passwordHash,
      password_salt: salt,
      role: "user",
      status: "active"
    }),
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 409) throw new Error("An account with this email already exists. Please sign in.");
    throw new Error(detail || "Unable to create your account.");
  }
  const rows = await response.json();
  const user = rows?.[0];
  if (!user?.id) throw new Error("Account was created but the login session could not be started.");
  await setSession(user.id);
  return { id: user.id, email: user.email, role: user.role };
}
