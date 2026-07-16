import { describe, expect, it } from "vitest";
import { ProxyResolutionError } from "@/lib/proxy/resolve";
import {
  accountStatusAfterJobFailure,
  isProxyConfigFailure,
} from "./job-failure-account-status";

describe("accountStatusAfterJobFailure", () => {
  it("does not mark ERROR for missing proxy (RU message)", () => {
    const msg =
      "Прокси обязателен — назначьте аккаунту прокси (режим невидимости или REQUIRE_PROXY_FOR_OUTREACH)";
    expect(accountStatusAfterJobFailure(new Error(msg), msg)).toBeNull();
    expect(isProxyConfigFailure(msg)).toBe(true);
  });

  it("does not mark ERROR for ProxyResolutionError instance", () => {
    const err = new ProxyResolutionError("Прокси обязателен — назначьте");
    expect(accountStatusAfterJobFailure(err, err.message)).toBeNull();
  });

  it("does not mark ERROR for inactive proxy", () => {
    const msg = 'Proxy "mobile-1" is inactive — enable it on the Proxies page or assign another';
    expect(accountStatusAfterJobFailure(new Error(msg), msg)).toBeNull();
  });

  it("marks ERROR for real session failures", () => {
    const msg = "Session expired or not logged in";
    expect(accountStatusAfterJobFailure(new Error(msg), msg)).toBe("ERROR");
  });

  it("marks BANNED for ban-like messages", () => {
    const msg = "Your account has been banned";
    expect(accountStatusAfterJobFailure(new Error(msg), msg)).toBe("BANNED");
  });
});
