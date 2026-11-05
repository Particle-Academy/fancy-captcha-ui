import { act } from "react";

/**
 * Stand-ins for the providers' browser APIs, shaped from their documentation
 * (Turnstile `turnstile.render/reset/remove`, reCAPTCHA `grecaptcha.render/
 * reset/execute/ready`, hCaptcha `hcaptcha.render/reset/remove`). jsdom never
 * fetches a <script src>, so nothing here touches a real provider.
 */
export interface FakeWidget {
  container: HTMLElement;
  options: Record<string, unknown>;
  /** Fire the widget's success callback, as a solved challenge would. */
  solve: (token: string) => Promise<void>;
  expire: () => Promise<void>;
  error: () => Promise<void>;
}

export interface FakeApi {
  widgets: FakeWidget[];
  resets: unknown[];
  removes: unknown[];
  executes: Array<{ siteKey: string; action: unknown }>;
}

function callback(options: Record<string, unknown>, name: string, ...args: unknown[]) {
  return act(async () => {
    (options[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
  });
}

export function installFakeApi(global: "turnstile" | "grecaptcha" | "hcaptcha"): FakeApi {
  const api: FakeApi = { widgets: [], resets: [], removes: [], executes: [] };
  let next = 0;
  let executed = 0;
  const impl = {
    render(container: HTMLElement, options: Record<string, unknown>) {
      const id = global === "grecaptcha" ? next++ : `widget-${next++}`;
      api.widgets.push({
        container,
        options,
        solve: (token) => callback(options, "callback", token),
        expire: () => callback(options, "expired-callback"),
        error: () => callback(options, "error-callback"),
      });

      return id;
    },
    reset(id: unknown) {
      api.resets.push(id);
    },
    remove(id: unknown) {
      api.removes.push(id);
    },
    ready(fn: () => void) {
      fn();
    },
    execute(siteKey: string, opts: { action?: unknown }) {
      api.executes.push({ siteKey, action: opts?.action });

      return Promise.resolve(`v3-token-${++executed}`);
    },
  };
  (window as unknown as Record<string, unknown>)[global] = impl;

  return api;
}

/** Marks every pending provider <script> as loaded, the way the browser would once it ran. */
export async function loadScripts(): Promise<HTMLScriptElement[]> {
  const scripts = Array.from(document.head.querySelectorAll<HTMLScriptElement>("script[data-fancy-captcha-script]"));
  await act(async () => {
    for (const script of scripts) script.dispatchEvent(new Event("load"));
  });

  return scripts;
}
