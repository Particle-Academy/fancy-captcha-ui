# Changelog

Notable changes to `@particle-academy/fancy-captcha-ui`.

**Pre-1.0: breaking changes land in MINOR releases.** Read those entries before upgrading.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.2.0] - 2026-11-05

### Added

- **`resetAfterSubmit` (default `true`): the captcha re-arms itself after every submit.**
  fancy-captcha's `captcha:<action>` middleware verifies before the controller validates, so
  a submit refused by your own validation ("email taken") has already spent its provider token
  (sent to siteverify) or its proof-of-work (`ProofOfWork::redeem()` marks it spent first).
  Until now only clearing the field re-armed the widget, which `form.reset()` does on success
  and nothing does on an error, so resubmitting the same form was refused. Now, when
  `form.processing` goes true and then false, the component resets the widget, re-executes
  reCAPTCHA v3, or solves a fresh challenge for whatever that submit posted. An unsolved widget
  or a first proof-of-work still running is left alone, a host `form.reset()` that already
  cleared the field does not cause a second reset, and the signed timestamp (not single-use) is
  never touched.
  **Consumer action:** none with Inertia's `useForm()` or fancy-inertia's `useFancyForm()`; it
  is on by default. If you worked around this by clearing `_captcha_token` / `_captcha_pow` in
  `onError` or `onFinish`, you can remove that (it is harmless if kept). Pass
  `resetAfterSubmit={false}` only if you reset the captcha yourself.
- **`CaptchaForm.processing?: boolean`**, the in-flight flag the re-arm watches. Optional, so a
  form adapter without it still type-checks and works as before.
  **Consumer action:** none. A custom form adapter can add `processing` to get the re-arm.

### Changed

- **README: per-form `action`.** The Inertia example now passes `action="signup"`, and says it
  must equal the route's `captcha:<action>`. The shared `fancyCaptcha` prop carries
  `action: null`; a mismatch refuses every submit under Turnstile and reCAPTCHA v3 (logged as
  `reason: action_mismatch`) and is not checked at all in built-in mode, hCaptcha or reCAPTCHA
  v2, so it stays hidden until the driver changes. No code changed: `action` was already a
  prop.
  **Consumer action:** if you spread the action into the config (`{...fancyCaptcha, action}`),
  switch to `<Captcha config={fancyCaptcha} form={form} action="signup" />`, and check every
  form's `action` against its route's middleware before moving to a provider.

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
