import type { CaptchaConfig, CaptchaFieldNames } from "./types";

/**
 * Default field names: the same constants as `FancyCaptcha\Fields` on the
 * server. A host that renames them in `fancy-captcha.fields` does not need to
 * touch the UI, because the names travel in the props.
 */
export const CAPTCHA_FIELDS: Readonly<CaptchaFieldNames> = Object.freeze({
  honeypot: "contact_fax",
  started: "_captcha_started",
  pow: "_captcha_pow",
  token: "_captcha_token",
});

export function fieldNames(config: CaptchaConfig | undefined, tokenName?: string): CaptchaFieldNames {
  return { ...CAPTCHA_FIELDS, ...config?.fields, ...(tokenName ? { token: tokenName } : {}) };
}

/**
 * Initial values to spread into a form's data:
 *
 *     const form = useForm({ email: "", ...captchaData(fancyCaptcha) });
 *
 * The honeypot starts empty and must stay that way; `started` is the signed
 * render time the server checks.
 */
export function captchaData(config: CaptchaConfig): Record<string, string> {
  const fields = fieldNames(config);

  return { [fields.honeypot]: "", [fields.started]: config.started, [fields.pow]: "", [fields.token]: "" };
}
