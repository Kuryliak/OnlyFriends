import { createInboxForUsername } from "./mailtm";

export async function provisionTempEmailForAccount(username: string) {
  const inbox = await createInboxForUsername(username);
  return {
    email: inbox.address,
    emailPassword: inbox.password,
  };
}