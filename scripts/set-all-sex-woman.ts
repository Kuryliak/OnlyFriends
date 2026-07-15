import { prisma } from "../src/lib/db";
import { ensureAccountSex, ACCOUNT_SEX_WOMAN } from "../src/lib/automation/account-sex";

async function main() {
  await prisma.account.updateMany({ data: { sex: ACCOUNT_SEX_WOMAN } });

  const accounts = await prisma.account.findMany({
    where: { status: { in: ["ACTIVE", "CAPTCHA", "IDLE"] }, cookies: { not: null } },
    include: { proxy: true },
    orderBy: { username: "asc" },
  });

  console.log(`[sex] Updating ${accounts.length} accounts on XVIDEOS to Woman...`);

  for (const account of accounts) {
    const result = await ensureAccountSex(account, account.proxy, ACCOUNT_SEX_WOMAN);
    if (result.success) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          cookies: result.cookies,
          sex: ACCOUNT_SEX_WOMAN,
          lastActive: new Date(),
        },
      });
      console.log(
        `[sex] ${account.username}: ${result.changed ? "updated to Woman" : "already Woman"}`
      );
    } else {
      console.log(`[sex] ${account.username}: FAILED — ${result.error}`);
    }
  }

  await prisma.$disconnect();
}

void main();