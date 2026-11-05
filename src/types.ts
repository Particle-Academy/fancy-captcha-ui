/** Which check a form uses. `builtin` needs no third party. */
export type CaptchaProvider = "builtin" | "turnstile" | "recaptcha-v2" | "recaptcha-v3" | "hcaptcha";

/** `builtin` renders hidden fields; `widget` renders the provider's widget; `invisible` (reCAPTCHA v3) renders nothing of its own. */
export type CaptchaMode = "builtin" | "widget" | "invisible";

/**
 * - `idle`: server-rendered, nothing has run yet.
 * - `loading`: the provider script is loading.
 * - `ready`: waiting for the person (a widget), or nothing to do (built-in without proof-of-work).
 * - `solving`: proof-of-work running.
 * - `solved`: a token or solution is in the form.
 * - `expired`: the provider token expired and was cleared.
 * - `error`: the script, the challenge or the provider failed. The form will be refused.
 * - `cancelled`: proof-of-work stopped by `cancel()`.
 * - `unconfigured`: a provider is selected without a site key. The server refuses every submission.
 */
export type CaptchaStatus = "idle" | "loading" | "ready" | "solving" | "solved" | "expired" | "error" | "cancelled" | "unconfigured";

export interface CaptchaFieldNames {
  honeypot: string;
  started: string;
  pow: string;
  token: string;
}

/**
 * The props `particle-academy/fancy-captcha` gives the UI (`Captcha::props()`,
 * shared with Inertia as `fancyCaptcha`). Never contains a secret.
 */
export interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string | null;
  action: string | null;
  fields: CaptchaFieldNames;
  /** The signed form-render time. */
  started: string;
  pow: { enabled: boolean; difficulty: number; challengeUrl: string | null };
  consentCategory: string | null;
  configured: boolean;
}

/**
 * The part of a form state object this package uses. Inertia's `useForm()` and
 * fancy-inertia's `useFancyForm()` both have it, so either can be passed as is.
 */
export interface CaptchaForm {
  data: object;
  // A method signature, so a stricter `setData<K extends keyof T>` is accepted.
  setData(key: string, value: string): void;
}

/**
 * What the consent gate needs. fancy-compliance-ui's `useConsent()` returns it
 * (and more), so pass that straight in. Typed structurally, so this package
 * does not depend on fancy-compliance-ui at all.
 */
export interface CaptchaConsent {
  allows(category: string): boolean;
}

export type CaptchaMessages = Record<string, string>;

export type Direction = "ltr" | "rtl";
