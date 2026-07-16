/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import WorkersPage from "./page";

const baseStatus = {
  settings: {
    concurrency: 4,
    proxyConcurrency: 1,
    outreachConcurrency: 2,
    pollMs: 3000,
    startStaggerMs: 1500,
    staleJobMs: 600_000,
  },
  sources: {
    concurrency: "default",
    proxyConcurrency: "default",
    outreachConcurrency: "default",
    pollMs: "default",
    startStaggerMs: "default",
    staleJobMs: "default",
  },
  bounds: {},
  summary: "test",
  snapshot: {
    totalRunning: 0,
    outreachRunning: 0,
    busyAccounts: 0,
    busyProxies: 0,
    slotsAvailable: 4,
    outreachSlotsAvailable: 2,
  },
  queue: { pending: 0, pausedCaptcha: 0 },
  runningJobs: [],
  workers: [],
  autoWarmup: {
    settings: {
      enabled: false,
      intervalMinutes: 90,
      durationMinutes: 3,
      maxPerCycle: 2,
    },
    bounds: {},
    eligibleNow: 5,
  },
  stealth: {
    settings: { enabled: false },
    activeProxies: 1,
    accountsWithoutProxy: 0,
  },
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function renderPage() {
  return render(
    <I18nProvider>
      <WorkersPage />
    </I18nProvider>
  );
}

function autoWarmupCard() {
  // Card header uses translation "Автопрогрев в простое"
  const title = screen.getByText("Автопрогрев в простое");
  // Walk up to the card container
  let el: HTMLElement | null = title;
  while (el && !el.classList.contains("p-5")) {
    el = el.parentElement;
  }
  if (!el) throw new Error("auto-warmup card not found");
  return el;
}

describe("WorkersPage auto-warmup", () => {
  /** Simulated server state — GET /status and PUT handlers stay in sync. */
  let serverState: typeof baseStatus;

  beforeEach(() => {
    serverState = structuredClone(baseStatus);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/workers/status") && (!init?.method || init.method === "GET")) {
          return jsonResponse(serverState);
        }
        if (url.includes("/api/workers/auto-warmup") && init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          serverState = {
            ...serverState,
            autoWarmup: {
              ...serverState.autoWarmup,
              settings: { ...serverState.autoWarmup.settings, ...body },
              eligibleNow: body.enabled === false ? 0 : 5,
            },
          };
          return jsonResponse({
            settings: serverState.autoWarmup.settings,
            bounds: {},
            eligibleNow: serverState.autoWarmup.eligibleNow,
          });
        }
        if (url.includes("/api/workers/stealth") && init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          serverState = {
            ...serverState,
            stealth: {
              ...serverState.stealth,
              settings: { enabled: Boolean(body.enabled) },
            },
          };
          return jsonResponse({ settings: serverState.stealth.settings });
        }
        if (url.includes("/api/workers/settings") && init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          serverState = { ...serverState, settings: { ...serverState.settings, ...body } };
          return jsonResponse({ settings: serverState.settings, sources: serverState.sources });
        }
        if (url.includes("/api/workers/settings") && init?.method === "DELETE") {
          serverState = {
            ...serverState,
            settings: structuredClone(baseStatus.settings),
            sources: structuredClone(baseStatus.sources),
          };
          return jsonResponse({ settings: serverState.settings, sources: serverState.sources });
        }
        return jsonResponse({ error: `unmocked ${url}` }, 500);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads auto-warmup settings into the form", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Готовы к прогреву сейчас:")).toBeTruthy();
    });
    const card = autoWarmupCard();
    const checkbox = within(card).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("keeps enabled toggle after status poll (does not clobber dirty form)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    renderPage();

    await waitFor(() => {
      expect(within(autoWarmupCard()).getByRole("checkbox")).toBeTruthy();
    });

    const checkbox = within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Poll would return enabled:false from server — form must stay true until save/refresh of clean state
    await vi.advanceTimersByTimeAsync(3500);

    const afterPoll = within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement;
    expect(afterPoll.checked).toBe(true);

    // Status was still polled
    const statusCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/api/workers/status")
    );
    expect(statusCalls.length).toBeGreaterThan(1);
  });

  it("keeps numeric params after poll while dirty", async () => {
    renderPage();
    await waitFor(() => {
      expect(within(autoWarmupCard()).getByRole("checkbox")).toBeTruthy();
    });

    const card = autoWarmupCard();
    // Enable so inputs are not disabled
    fireEvent.click(within(card).getByRole("checkbox"));

    const inputs = within(card).getAllByRole("textbox") as HTMLInputElement[];
    // interval, duration, maxPerCycle
    expect(inputs.length).toBeGreaterThanOrEqual(3);

    fireEvent.change(inputs[0], { target: { value: "45" } });
    expect(inputs[0].value).toBe("45");

    await vi.advanceTimersByTimeAsync(3500);

    const inputsAfter = within(autoWarmupCard()).getAllByRole("textbox") as HTMLInputElement[];
    expect(inputsAfter[0].value).toBe("45");
  });

  it("allows clearing digits completely; empty fields save as defaults", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    renderPage();
    await waitFor(() => {
      expect(within(autoWarmupCard()).getByRole("checkbox")).toBeTruthy();
    });

    const card = autoWarmupCard();
    fireEvent.click(within(card).getByRole("checkbox"));

    const inputs = within(card).getAllByRole("textbox") as HTMLInputElement[];
    // wipe interval completely
    fireEvent.change(inputs[0], { target: { value: "" } });
    expect(inputs[0].value).toBe("");
    // wipe duration and max too
    fireEvent.change(inputs[1], { target: { value: "" } });
    fireEvent.change(inputs[2], { target: { value: "" } });
    expect(inputs[1].value).toBe("");
    expect(inputs[2].value).toBe("");

    fireEvent.click(within(card).getByRole("button", { name: /Сохранить/i }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes("/api/workers/auto-warmup") && c[1]?.method === "PUT"
      );
      expect(putCalls.length).toBe(1);
      const body = JSON.parse(String(putCalls[0][1]?.body));
      // defaults from AUTO_WARMUP_BOUNDS
      expect(body.intervalMinutes).toBe(90);
      expect(body.durationMinutes).toBe(3);
      expect(body.maxPerCycle).toBe(2);
      expect(body.enabled).toBe(true);
    });
  });

  it("saves enabled:true and reflects server confirmation", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    renderPage();

    await waitFor(() => {
      expect(within(autoWarmupCard()).getByRole("checkbox")).toBeTruthy();
    });

    const card = autoWarmupCard();
    fireEvent.click(within(card).getByRole("checkbox"));

    const saveBtn = within(card).getByRole("button", { name: /Сохранить|Saving|save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes("/api/workers/auto-warmup") && c[1]?.method === "PUT"
      );
      expect(putCalls.length).toBe(1);
      const body = JSON.parse(String(putCalls[0][1]?.body));
      expect(body.enabled).toBe(true);
    });

    await waitFor(() => {
      expect(within(autoWarmupCard()).getByRole("checkbox")).toBeTruthy();
      expect((within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement).checked).toBe(
        true
      );
    });
  });

  it("can disable auto-warmup after it was enabled", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    serverState = {
      ...serverState,
      autoWarmup: {
        ...serverState.autoWarmup,
        settings: { ...serverState.autoWarmup.settings, enabled: true },
        eligibleNow: 5,
      },
    };

    renderPage();
    await waitFor(() => {
      const cb = within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement;
      expect(cb.checked).toBe(true);
    });

    fireEvent.click(within(autoWarmupCard()).getByRole("checkbox"));
    expect((within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false
    );

    // Poll with server still enabled:true must not flip the checkbox back
    await vi.advanceTimersByTimeAsync(3500);
    expect((within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false
    );

    fireEvent.click(within(autoWarmupCard()).getByRole("button", { name: /Сохранить|Saving|save/i }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes("/api/workers/auto-warmup") && c[1]?.method === "PUT"
      );
      expect(putCalls.length).toBe(1);
      expect(JSON.parse(String(putCalls[0][1]?.body)).enabled).toBe(false);
    });

    await waitFor(() => {
      expect((within(autoWarmupCard()).getByRole("checkbox") as HTMLInputElement).checked).toBe(
        false
      );
    });
  });

  it("keeps dirty worker concurrency after poll", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Параллельных задач")).toBeTruthy();
    });

    const label = screen.getByText("Параллельных задач");
    const row = label.closest("div")?.parentElement;
    expect(row).toBeTruthy();
    const input = within(row as HTMLElement).getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8" } });
    expect(input.value).toBe("8");

    await vi.advanceTimersByTimeAsync(3500);

    const inputAfter = within(row as HTMLElement).getByRole("textbox") as HTMLInputElement;
    expect(inputAfter.value).toBe("8");
  });

  it("does not overwrite dirty stealth toggle on poll", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Включить режим невидимости")).toBeTruthy();
    });

    const stealthEnabledLabel = screen.getByText("Включить режим невидимости");
    const labelEl = stealthEnabledLabel.closest("label");
    expect(labelEl).toBeTruthy();
    const checkbox = within(labelEl!).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    await vi.advanceTimersByTimeAsync(3500);
    const after = within(labelEl!).getByRole("checkbox") as HTMLInputElement;
    expect(after.checked).toBe(true);
  });
});
