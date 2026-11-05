import type { CaptchaProvider } from "./types";

/**
 * The provider widgets, behind one shape. URLs and option names are each
 * provider's documented explicit-render API:
 *
 * - Turnstile: `turnstile.render(el, { sitekey, action, callback, "expired-callback", "error-callback", "timeout-callback" })`, `reset(id)`, `remove(id)`.
 * - reCAPTCHA v2: `grecaptcha.render(el, { sitekey, callback, "expired-callback", "error-callback" })`, `reset(id)`. No remove; the element goes with ours.
 * - reCAPTCHA v3: `grecaptcha.ready(fn)`, `grecaptcha.execute(siteKey, { action })` resolving a token valid for two minutes.
 * - hCaptcha: `hcaptcha.render(el, { sitekey, callback, "expired-callback", "chalexpired-callback", "error-callback" })`, `reset(id)`, `remove(id)`.
 */
type WidgetId = string | number;

interface WidgetApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => WidgetId;
  reset: (id?: WidgetId) => void;
  remove?: (id: WidgetId) => void;
  ready?: (callback: () => void) => void;
  execute?: (siteKey: string, options: { action?: string }) => Promise<string>;
}

export interface WidgetCallbacks {
  token: (token: string) => void;
  expired: () => void;
  error: () => void;
}

export interface Adapter {
  global: "turnstile" | "grecaptcha" | "hcaptcha";
  scriptUrl: (siteKey: string) => string;
  /** reCAPTCHA v3 renders nothing and is executed instead. */
  invisible: boolean;
  options: (siteKey: string, action: string | null, theme: string | undefined, callbacks: WidgetCallbacks) => Record<string, unknown>;
  remove: boolean;
}

export const ADAPTERS: Record<Exclude<CaptchaProvider, "builtin">, Adapter> = {
  turnstile: {
    global: "turnstile",
    scriptUrl: () => "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    invisible: false,
    remove: true,
    options: (sitekey, action, theme, cb) => ({
      sitekey,
      ...(action ? { action } : {}),
      ...(theme ? { theme } : {}),
      callback: cb.token,
      "expired-callback": cb.expired,
      "error-callback": cb.error,
      "timeout-callback": cb.expired,
    }),
  },
  "recaptcha-v2": {
    global: "grecaptcha",
    scriptUrl: () => "https://www.google.com/recaptcha/api.js?render=explicit",
    invisible: false,
    remove: false,
    options: (sitekey, _action, theme, cb) => ({
      sitekey,
      ...(theme && theme !== "auto" ? { theme } : {}),
      callback: cb.token,
      "expired-callback": cb.expired,
      "error-callback": cb.error,
    }),
  },
  "recaptcha-v3": {
    global: "grecaptcha",
    scriptUrl: (siteKey) => `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`,
    invisible: true,
    remove: false,
    options: () => ({}),
  },
  hcaptcha: {
    global: "hcaptcha",
    scriptUrl: () => "https://js.hcaptcha.com/1/api.js?render=explicit",
    invisible: false,
    remove: true,
    options: (sitekey, _action, theme, cb) => ({
      sitekey,
      ...(theme && theme !== "auto" ? { theme } : {}),
      callback: cb.token,
      "expired-callback": cb.expired,
      "chalexpired-callback": cb.expired,
      "error-callback": cb.error,
    }),
  },
};

export function currentApi(adapter: Adapter): WidgetApi | null {
  const api = (window as unknown as Record<string, unknown>)[adapter.global] as Partial<WidgetApi> | undefined;
  if (!api) return null;
  if (adapter.invisible ? typeof api.execute !== "function" : typeof api.render !== "function") return null;

  return api as WidgetApi;
}

const MARK = "data-fancy-captcha-script";
const loading = new Map<string, { element: HTMLScriptElement; promise: Promise<void> }>();

/**
 * Insert a provider script once per URL, however many widgets ask. Called only
 * from effects, so nothing touches `document` during server rendering. A tag
 * that was removed from the page (a SPA head reset) is loaded again rather
 * than waited on forever.
 */
export function loadScript(src: string): Promise<void> {
  const known = loading.get(src);
  if (known && known.element.isConnected) return known.promise;

  const element = document.createElement("script");
  element.src = src;
  element.async = true;
  element.defer = true;
  element.setAttribute(MARK, "");
  const promise = new Promise<void>((resolve, reject) => {
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener(
      "error",
      () => {
        loading.delete(src);
        element.remove();
        reject(new Error("fancy-captcha: the provider script failed to load"));
      },
      { once: true },
    );
  });
  loading.set(src, { element, promise });
  document.head.appendChild(element);

  return promise;
}

/** The provider's API once its script has run (and, for reCAPTCHA, once it says it is ready). */
export async function providerApi(adapter: Adapter, src: string): Promise<WidgetApi> {
  let api = currentApi(adapter);
  if (!api) {
    await loadScript(src);
    api = currentApi(adapter);
  }
  if (!api) throw new Error(`fancy-captcha: ${adapter.global} did not load`);
  const ready = api.ready;
  if (typeof ready === "function") await new Promise<void>((resolve) => ready(resolve));

  return api;
}

export type { WidgetApi, WidgetId };
