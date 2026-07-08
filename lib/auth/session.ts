import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "janus_session";
const SESSION_DURATION = "30d";

export type SessionPayload = {
  playerId: string;
};

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.playerId !== "string") return null;
    return { playerId: payload.playerId };
  } catch {
    return null;
  }
}
