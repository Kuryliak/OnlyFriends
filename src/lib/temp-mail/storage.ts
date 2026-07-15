import type { MailTmInbox } from "./mailtm";

const STORAGE_KEY = "onlyfriends.tempMailInbox";

export function loadTempMailInbox(): MailTmInbox | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MailTmInbox;
  } catch {
    return null;
  }
}

export function saveTempMailInbox(inbox: MailTmInbox) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(inbox));
}

export function clearTempMailInbox() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}