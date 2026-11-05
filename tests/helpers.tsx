import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHash } from "node:crypto";
import type { CaptchaConfig } from "../src";

// React 19 wants this flag set for act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  root: Root;
  rerender: (ui: ReactNode) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function mount(ui: ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));

  return {
    container,
    root,
    rerender: async (next) => act(async () => root.render(next)),
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

export function q<T extends Element = HTMLElement>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

export function input(name: string): HTMLInputElement | null {
  return q<HTMLInputElement>(`input[name="${name}"]`);
}

/** Lets pending promises and zero-delay timers run, inside act. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Waits (in act) until the predicate holds, or fails after `ms`. */
export async function until(predicate: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error("until(): timed out");
    await flush(1);
  }
}

export const CHALLENGE_ID = "AbCdEfGhIjKlMnOpQrStUv";

export function config(overrides: Partial<CaptchaConfig> = {}): CaptchaConfig {
  return {
    provider: "builtin",
    siteKey: null,
    action: null,
    fields: { honeypot: "contact_fax", started: "_captcha_started", pow: "_captcha_pow", token: "_captcha_token" },
    started: "1762344000.c2lnbmVkLXRpbWVzdGFtcC1mb3ItdGhlLXRlc3RzLW9r",
    pow: { enabled: false, difficulty: 8, challengeUrl: "/fancy-captcha/challenge" },
    consentCategory: null,
    configured: true,
    ...overrides,
  };
}

/** The server's check, re-implemented with node:crypto so the browser solver is checked against an independent SHA-256. */
export function serverAccepts(solution: string, difficulty: number): boolean {
  const [id, nonce] = solution.split(":");
  if (!id || !nonce || !/^[0-9]+$/.test(nonce)) return false;
  const hash = createHash("sha256").update(`${id}:${nonce}`).digest();
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }

  return bits >= difficulty;
}

/** A form adapter shaped like Inertia's useForm / fancy-inertia's useFancyForm: { data, setData(key, value) }. */
export function fakeForm(initial: Record<string, string> = {}) {
  const form = {
    data: { ...initial } as Record<string, string>,
    calls: [] as Array<[string, string]>,
    setData(key: string, value: string) {
      form.calls.push([key, value]);
      form.data = { ...form.data, [key]: value };
    },
  };

  return form;
}

export function mockChallengeFetch(responses: Array<unknown> = [{ id: CHALLENGE_ID, difficulty: 8, expiresIn: 300, algorithm: "sha256-leading-zero-bits" }]) {
  const calls: string[] = [];
  let i = 0;
  const fetchMock = async (url: RequestInfo | URL) => {
    calls.push(String(url));
    const body = responses[Math.min(i++, responses.length - 1)];

    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  globalThis.fetch = fetchMock as typeof fetch;

  return calls;
}

export function cleanupDom(): void {
  document.body.innerHTML = "";
  document.head.querySelectorAll("script[data-fancy-captcha-script]").forEach((node) => node.remove());
  for (const key of ["turnstile", "grecaptcha", "hcaptcha"]) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
}
