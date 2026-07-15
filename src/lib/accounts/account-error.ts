/** Matches job guard messages for blocked ERROR accounts (legacy EN + current RU). */
export function isAccountErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /account is error/i.test(message) ||
    /аккаунт в статусе «ошибка»/i.test(message) ||
    /предыдущая задача не удалась/i.test(message)
  );
}

export function accountNeedsRecovery(status: string): boolean {
  return status === "ERROR";
}

export function accountNeedsCaptcha(status: string): boolean {
  return status === "CAPTCHA";
}