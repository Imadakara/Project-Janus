import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { assignRandomRole } from "@/lib/auth/role";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { trackEvent } from "@/lib/analytics/track";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные регистрации." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Аккаунт с таким email уже существует." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const role = assignRandomRole();

  const defaultModules = await prisma.commandModule.findMany({
    where: { isDefault: true },
    select: { key: true },
  });

  const player = await prisma.player.create({
    data: {
      email,
      passwordHash,
      role,
      moduleUnlocks: {
        create: defaultModules.map((mod) => ({ moduleKey: mod.key })),
      },
    },
  });

  await trackEvent("REGISTER", player.id, { role: player.role });

  const token = await createSessionToken({ playerId: player.id });

  const response = NextResponse.json({ id: player.id, email: player.email, role: player.role });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Без maxAge/expires — кука сессионная, см. комментарий в app/api/auth/login/route.ts.
  });

  return response;
}
