import { PrismaClient } from "@prisma/client";
import { bootstrapAdminUser } from "./admin-user";

const prisma = new PrismaClient();

bootstrapAdminUser(prisma)
  .then((result) => {
    if (result.status === "skipped") {
      console.log("Admin bootstrap skipped: ADMIN_EMAIL and ADMIN_PASSWORD are not set.");
      return;
    }

    console.log(`Admin account ${result.status}: ${result.email}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
