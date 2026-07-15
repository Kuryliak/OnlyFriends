import { randomBytes } from "crypto";

const WOMEN_FIRST_NAMES = [
  "Sophia",
  "Emma",
  "Olivia",
  "Ava",
  "Isabella",
  "Mia",
  "Charlotte",
  "Amelia",
  "Evelyn",
  "Abigail",
  "Emily",
  "Elizabeth",
  "Sofia",
  "Ella",
  "Scarlett",
  "Grace",
  "Chloe",
  "Victoria",
  "Aria",
  "Lily",
  "Aurora",
  "Zoey",
  "Penelope",
  "Layla",
  "Nora",
  "Camila",
  "Hannah",
  "Luna",
  "Stella",
  "Violet",
  "Lucy",
  "Anna",
  "Caroline",
  "Maya",
  "Willow",
  "Naomi",
  "Elena",
  "Sarah",
  "Valentina",
  "Claire",
  "Ruby",
  "Ivy",
  "Jasmine",
  "Brooke",
  "Natalie",
  "Audrey",
  "Bella",
  "Alice",
  "Rose",
  "Julia",
  "Katherine",
  "Gabriella",
  "Sadie",
  "Melody",
  "Jennifer",
  "Jessica",
  "Michelle",
  "Amanda",
  "Nicole",
  "Stephanie",
  "Rachel",
  "Lauren",
  "Samantha",
  "Ashley",
  "Brittany",
  "Danielle",
  "Rebecca",
  "Laura",
  "Maria",
  "Diana",
  "Catherine",
  "Christina",
  "Patricia",
  "Angela",
  "Melissa",
  "Kimberly",
  "Lisa",
  "Nancy",
  "Karen",
  "Susan",
  "Margaret",
  "Helen",
  "Sandra",
  "Donna",
  "Carol",
  "Ruth",
  "Sharon",
  "Deborah",
  "Cynthia",
  "Kathleen",
  "Amy",
  "Shirley",
  "Brenda",
  "Pamela",
  "Veronica",
  "Monica",
  "Andrea",
  "Tiffany",
  "Heather",
  "Melanie",
  "Christine",
  "Vanessa",
  "Crystal",
  "Brittney",
  "Caitlin",
  "Haley",
  "Mackenzie",
  "Payton",
  "Savannah",
  "Autumn",
  "Destiny",
  "Faith",
  "Hope",
  "Summer",
  "April",
  "June",
  "Daisy",
  "Hazel",
  "Iris",
  "Fiona",
  "Gianna",
  "Isla",
  "Lillian",
  "Mila",
  "Nina",
  "Paige",
] as const;

/** Names that read as unisex or masculine — never picked for new accounts. */
const EXCLUDED_NAMES = new Set([
  "Riley",
  "Quinn",
  "Harper",
  "Avery",
  "Madison",
  "Kennedy",
  "Genesis",
]);

const FEMININE_FIRST_NAMES = WOMEN_FIRST_NAMES.filter(
  (name) => !EXCLUDED_NAMES.has(name)
);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function nameBase(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

const USERNAME_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** High-entropy suffix — time fragment + random alphanumeric (avoids XVIDEOS collisions). */
export function uniqueUsernameSuffix(length = 8): string {
  const timePart = Date.now().toString(36).slice(-4);
  const randomPart = Array.from(randomBytes(length), (byte) =>
    USERNAME_SUFFIX_CHARS[byte % USERNAME_SUFFIX_CHARS.length]
  ).join("");
  return `${timePart}${randomPart}`;
}

function toUsername(displayName: string): string {
  const safeBase = nameBase(displayName);
  const base = (safeBase.length >= 3 ? safeBase : "girl").slice(0, 14);
  return `${base}${uniqueUsernameSuffix()}`;
}

/** XVIDEOS profile name: feminine first name + same unique suffix as username. */
export function womanProfileName(displayName: string, username: string): string {
  const base = displayName.trim();
  if (!base) return username;

  const normalized = nameBase(base);
  const user = username.toLowerCase();
  if (normalized && user.startsWith(normalized)) {
    const suffix = user.slice(normalized.length);
    if (suffix) return base + suffix;
  }

  return `${base}${uniqueUsernameSuffix()}`;
}

export function generateWomanIdentity(): { displayName: string; username: string } {
  const displayName = pick(FEMININE_FIRST_NAMES);
  return { displayName, username: toUsername(displayName) };
}