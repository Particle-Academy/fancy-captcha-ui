import type { CaptchaMessages } from "./types";

/**
 * English defaults. Every visible (or announced) string is looked up by key;
 * a host passes `messages` with its own translations and anything left out
 * falls back to English here, never to the raw key.
 */
export const DEFAULT_MESSAGES: Readonly<CaptchaMessages> = Object.freeze({
  // The honeypot's label. Never shown to a person; read by bots, so it reads like a real field.
  "fancy-captcha.honeypot.label": "Fax number",
  "fancy-captcha.pow.label": "Checking this form is not automated",
  "fancy-captcha.pow.solving": "Checking this form is not automated, {percent}% done.",
  "fancy-captcha.pow.done": "Check complete.",
  "fancy-captcha.pow.error": "The check could not run. Reload the page and try again.",
  "fancy-captcha.pow.cancelled": "The check was stopped.",
  "fancy-captcha.widget.error": "The check could not load. Reload the page and try again.",
  "fancy-captcha.widget.expired": "The check expired. Please complete it again.",
  "fancy-captcha.unconfigured": "Verification is not set up on this site, so this form cannot be sent.",
});

export type Translate = (key: string, replace?: Record<string, string | number>) => string;

export function createTranslator(messages: CaptchaMessages | undefined): Translate {
  return (key, replace) => {
    let text = messages?.[key] ?? DEFAULT_MESSAGES[key] ?? key;
    for (const [name, value] of Object.entries(replace ?? {})) {
      text = text.split(`{${name}}`).join(String(value));
    }

    return text;
  };
}
