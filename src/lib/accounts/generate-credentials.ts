import { generateWomanIdentity, uniqueUsernameSuffix } from "@/lib/names/women";

function randomChunk(length: number, chars: string): string {
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function generateAccountPassword(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return `${randomChunk(6, letters)}-${randomChunk(5, letters)}-${randomChunk(6, letters)}`;
}

export function generateWomanAccount(
  takenUsernames: Set<string> = new Set()
): { displayName: string; username: string; password: string } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { displayName, username } = generateWomanIdentity();
    const normalized = username.toLowerCase();
    if (!takenUsernames.has(normalized)) {
      takenUsernames.add(normalized);
      return { displayName, username: normalized, password: generateAccountPassword() };
    }
  }

  const fallback = `woman${uniqueUsernameSuffix(10)}`;
  takenUsernames.add(fallback);
  return {
    displayName: "Melody",
    username: fallback,
    password: generateAccountPassword(),
  };
}

export function generateWomanAccounts(
  count: number,
  takenUsernames: Set<string> = new Set()
): Array<{ displayName: string; username: string; password: string }> {
  return Array.from({ length: count }, () => generateWomanAccount(takenUsernames));
}