import { prisma } from "../src/lib/db";
import { launchBrowser, closeBrowser } from "../src/lib/automation/browser";
import { gotoXvideos } from "../src/lib/automation/overlays";
import { resolveAccountProfileSlug } from "../src/lib/automation/resolve-profile-slug";

async function main() {
  const accounts = await prisma.account.findMany({
    include: { proxy: true },
    orderBy: { username: "asc" },
  });

  for (const account of accounts) {
    const slug = await resolveAccountProfileSlug(account, account.proxy);
    console.log(`${account.username} -> ${slug ?? "(not found)"}`);
    if (slug) {
      await prisma.account.update({
        where: { id: account.id },
        data: { profileSlug: slug },
      });
    }
  }
}

void main();