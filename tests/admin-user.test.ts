import { describe, expect, it } from "vitest";
import { bootstrapAdminUser } from "../prisma/admin-user";

describe("admin bootstrap", () => {
  it("skips when admin credentials are absent", async () => {
    const calls: { method: string; args?: unknown }[] = [];

    await expect(bootstrapAdminUser(createDb(calls, null) as never, {} as NodeJS.ProcessEnv)).resolves.toEqual({
      status: "skipped"
    });
    expect(calls).toEqual([]);
  });

  it("creates an admin user from environment credentials", async () => {
    const calls: { method: string; args?: unknown }[] = [];

    await expect(
      bootstrapAdminUser(createDb(calls, null) as never, {
        ADMIN_EMAIL: " Admin@Example.COM ",
        ADMIN_PASSWORD: "admin-password",
        ADMIN_NAME: "Root"
      } as NodeJS.ProcessEnv)
    ).resolves.toEqual({
      status: "created",
      email: "admin@example.com"
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "user.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            email: "admin@example.com",
            name: "Root",
            role: "admin"
          })
        })
      })
    );
  });

  it("updates an existing admin user from environment credentials", async () => {
    const calls: { method: string; args?: unknown }[] = [];

    await expect(
      bootstrapAdminUser(createDb(calls, { id: "user_1" }) as never, {
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "admin-password"
      } as NodeJS.ProcessEnv)
    ).resolves.toEqual({
      status: "updated",
      email: "admin@example.com"
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "user.update",
        args: expect.objectContaining({
          where: { email: "admin@example.com" },
          data: expect.objectContaining({
            name: "管理员",
            role: "admin"
          })
        })
      })
    );
  });

  it("rejects partial or weak admin credentials", async () => {
    await expect(
      bootstrapAdminUser(createDb([], null) as never, {
        ADMIN_EMAIL: "admin@example.com"
      } as NodeJS.ProcessEnv)
    ).rejects.toThrow("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.");
    await expect(
      bootstrapAdminUser(createDb([], null) as never, {
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "short"
      } as NodeJS.ProcessEnv)
    ).rejects.toThrow("ADMIN_PASSWORD must be at least 8 characters.");
  });
});

function createDb(calls: { method: string; args?: unknown }[], existing: { id: string } | null) {
  return {
    user: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "user.findUnique", args });
        return existing;
      },
      create: async (args: unknown) => {
        calls.push({ method: "user.create", args });
        return args;
      },
      update: async (args: unknown) => {
        calls.push({ method: "user.update", args });
        return args;
      }
    }
  };
}
