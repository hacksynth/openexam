import { type PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "@openexam/core/password";

export type BootstrapAdminResult =
  | {
      status: "skipped";
    }
  | {
      status: "created" | "updated";
      email: string;
    };

export async function bootstrapAdminUser(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<BootstrapAdminResult> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const name = env.ADMIN_NAME?.trim() || "管理员";

  if (!email && !password) {
    return { status: "skipped" };
  }

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });
  const passwordHash = await hashPassword(password);

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role: UserRole.admin,
        passwordHash
      }
    });

    return { status: "updated", email };
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: UserRole.admin,
      passwordHash
    }
  });

  return { status: "created", email };
}
