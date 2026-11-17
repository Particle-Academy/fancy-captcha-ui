# Using @particle-academy/fancy-captcha-ui — guide for agents

How an agent installs and uses this package in a consumer app. What the package
is, is in [README.md](./README.md). Notes for working ON this repo's code are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```bash
npm install @particle-academy/fancy-captcha-ui
```

- **Peers:** `@particle-academy/react-fancy` `>=6.11.0 <7.0.0`, `react ^19`,
  `react-dom ^19`. **Node:** `>=22`.
- **The server half** is `particle-academy/fancy-captcha` (Composer). It shares
  the `fancyCaptcha` prop with every Inertia page and verifies submits in its
  `captcha:<action>` middleware.
- **Tailwind v4** must scan the dist:

  ```css
  @source "../node_modules/@particle-academy/fancy-captcha-ui/dist/**/*.js";
  ```

## Find it on the Fancy MCP server

The catalog server is `https://ui.particle.academy/mcp` (streamable HTTP, no API
key; MCP id `fancy-ui`). Its registry slug is `fancy-captcha-ui`: use
`install-instructions` / `get-component` with that slug, or `search-components`
("captcha"). The server package is found with `search-backend-packages`
(stack `php`).

## API essentials

```tsx
const { fancyCaptcha } = usePage<{ fancyCaptcha: CaptchaConfig }>().props;
const form = useForm({ email: "", ...captchaData(fancyCaptcha) });

<Captcha config={fancyCaptcha} form={form} action="signup" />
```

- **`<Captcha>`**: `config` (a `CaptchaConfig`), `form` (anything with `data` and
  `setData`; Inertia's `useForm` and fancy-inertia's `useFancyForm` both work),
  `action`, `consent`, `messages`, `scriptUrl`, `onStatusChange`. Without a
  form it renders named inputs for a plain POST, or takes `provider`, `siteKey`,
  `name` and `onToken` directly.
- **Providers:** `builtin` (default: honeypot, signed timestamp, optional
  proof-of-work), `turnstile`, `recaptcha-v2`, `recaptcha-v3`, `hcaptcha`.
- **`useCaptcha({ config, form })`** is the headless hook: `values`,
  `widgetRef`, `status`, `progress`, `reset()`, `cancel()`.
- **`captchaData(config)`** seeds a form's initial data; `CAPTCHA_FIELDS` names
  the fields.

## Traps

- **An agent must never solve or submit a captcha for a person.** Telling people
  and automation apart is the only thing a captcha is for. Read its state from
  the root's `data-fancy-captcha`, `data-fancy-captcha-provider`,
  `data-fancy-captcha-mode` and `data-fancy-captcha-status` attributes, or from
  `onStatusChange`. Any MCP bridge written for it must be read-only.
- **`action` must match the route's middleware** (`captcha:signup` with
  `action="signup"`). Pass it as a prop, not spread into the config. A mismatch
  refuses every submit under Turnstile and reCAPTCHA v3, and stays hidden under
  the other modes until the driver changes.
- **Pass the form itself, not `{ data, setData }`.** With `processing`, the
  component re-arms the single-use token or proof-of-work after every submit.
- **Consent:** when the server sets `fancy-captcha.consent.category`, a gated
  provider renders only after `consent.allows(category)` is true (for example
  `consent={useConsent()}` from fancy-compliance-ui). No `consent` counts as not
  granted, and the built-in check renders instead.
- **A strict CSP** needs `worker-src blob:` to keep proof-of-work in a Worker;
  otherwise it runs, slower, on the main thread.
- **Third-party widgets carry their own accessibility.** Keep the built-in mode
  if that matters for the form.
