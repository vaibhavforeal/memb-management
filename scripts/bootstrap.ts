import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
async function main() {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 16 characters) to create the platform administrator.",
    );
  if (await db.user.findUnique({ where: { email: email.toLowerCase() } }))
    throw new Error(
      "This user already exists. Bootstrap never overwrites accounts.",
    );
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name: process.env.ADMIN_NAME || "Platform administrator",
      email: email.toLowerCase(),
      emailVerified: true,
      platformAdmin: true,
      accounts: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: id,
          password: await hashPassword(password),
        },
      },
    },
  });
  console.info(
    "Platform administrator created. Remove ADMIN_PASSWORD from your environment.",
  );
}
main().finally(() => db.$disconnect());
