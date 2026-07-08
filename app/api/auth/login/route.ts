import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные входа." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const player = await prisma.player.findUnique({ where: { email } });
  const passwordValid = player ? await verifyPassword(password, player.passwordHash) : false;

  if (!player || !passwordValid) {
    return NextResponse.json({ error: "Неверный email или пароль." }, { status: 401 });
  }

  const token = await createSessionToken({ playerId: player.id });

  const response = NextResponse.json({ id: player.id, email: player.email, role: player.role });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
