# Changelog

Notable changes to `@particle-academy/fancy-captcha-ui`.

**Pre-1.0: breaking changes land in MINOR releases.** Read those entries before upgrading.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added

- **`<Captcha>`, one component for every provider**: `builtin` (the default), `turnstile`,
  `recaptcha-v2`, `recaptcha-v3` and `hcaptcha`. Takes fancy-captcha's server props
  (`config`), or `provider` / `siteKey` / `action` / `name` directly. Exposes the token through
  `onToken` and a hidden form field.
- **`useCaptcha()`** for headless use: values, status, progress, `widgetRef`, `reset()`,
  `cancel()`.
- **Works with Inertia's `useForm()` and fancy-inertia's `useFancyForm()`** through `form`
  (anything with `data` and `setData(key, value)`), and with a plain `<form>`.
  `captchaData(config)` seeds a form's data.
- **Reset when consumed.** Clearing the token or solution (as `form.reset()` does after a
  submit) resets the widget, re-executes reCAPTCHA v3 or solves a fresh challenge. Expiry and
  errors clear the token.
- **Lazy, SSR-safe script loading**: in an effect, once per URL for any number of widgets,
  reusing an API already on the page. `scriptUrl` for a self-hosted copy.
- **Built-in mode**: an off-screen honeypot hidden from assistive tech and the keyboard, the
  signed timestamp, and proof-of-work solved in a Web Worker built from a Blob (main-thread
  slices when a Worker cannot be made), with a progress bar, a polite live region and
  cancellation. Challenges outside 8..32 bits are refused.
- **Optional consent gating** with fancy-compliance-ui, structurally typed so it is not a
  dependency: a gated provider renders only after its category is granted, with the built-in
  check (and proof-of-work) as the fallback.
- **RTL** through `dir` or inheritance; **AAA** where we control it. Read-only
  `data-fancy-captcha-*` handles and `onStatusChange` for agents, which must never solve a
  captcha.
- `CAPTCHA_FIELDS`, the same field names as the server's `FancyCaptcha\Fields`.

**Consumer action:** new package. Install it with `particle-academy/fancy-captcha` on the
server, add the `@source` line for Tailwind, and add `worker-src blob:` if you run a strict CSP
and want proof-of-work off the main thread.
