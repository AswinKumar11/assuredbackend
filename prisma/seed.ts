import { OpsRole, PrismaClient, Prisma } from '@prisma/client';

import { CONFIG_DEFAULTS, FLAG_DEFAULTS } from '../src/config/config-keys';
import { hashPassword } from '../src/shared/auth/password';

// Plain `ts-node` does not read .env; Node 24 can. Existing env vars win.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the environment as given.
}

const prisma = new PrismaClient();

/**
 * Seeds the config and flag tables so ops has something to edit on day one.
 * Uses upsert-create-only semantics: re-running never overwrites a value ops
 * has since changed.
 */
async function main(): Promise<void> {
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await prisma.config.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }

  for (const [key, enabled] of Object.entries(FLAG_DEFAULTS)) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: {},
    });
  }

  console.log(
    `Seeded ${Object.keys(CONFIG_DEFAULTS).length} config keys and ` +
      `${Object.keys(FLAG_DEFAULTS).length} feature flags.`,
  );

  await seedFirstAdmin();
}

/**
 * The first ADMIN, from OPS_ADMIN_EMAIL / OPS_ADMIN_PASSWORD. Every other ops
 * user is created by an admin through POST /v1/ops/users. Create-only: an
 * existing user with that email is left exactly as it is.
 */
async function seedFirstAdmin(): Promise<void> {
  const email = process.env.OPS_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.OPS_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('OPS_ADMIN_EMAIL / OPS_ADMIN_PASSWORD not set; skipping first admin.');
    return;
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error('OPS_ADMIN_PASSWORD must be 12-128 characters.');
  }

  const existing = await prisma.opsUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Ops user ${email} already exists; left unchanged.`);
    return;
  }

  await prisma.opsUser.create({
    data: { email, passwordHash: await hashPassword(password), role: OpsRole.ADMIN },
  });
  console.log(`Created ADMIN ops user ${email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
