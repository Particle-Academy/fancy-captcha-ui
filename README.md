# fancy-captcha-ui

One React 19 captcha component for every provider, built from
[`@particle-academy/react-fancy`](https://github.com/Particle-Academy/react-fancy). The server half
is [`particle-academy/fancy-captcha`](https://github.com/Particle-Academy/fancy-captcha) on Packagist.

```bash
npm install @particle-academy/fancy-captcha-ui
```

| provider | what renders |
|---|---|
| `builtin` (default) | a hidden honeypot and a signed timestamp; proof-of-work in a Web Worker when the server enables it |
| `turnstile` | the Cloudflare Turnstile widget |
| `recaptcha-v2` | the reCAPTCHA checkbox |
| `recaptcha-v3` | nothing (invisible; Google shows its own badge) |
| `hcaptcha` | the hCaptcha widget |

Every mode also renders the honeypot and the timestamp, because the server checks them in front
of a provider too.

## With Inertia's `useForm`

fancy-captcha shares its props with every page as `fancyCaptcha`.

```tsx
import { useForm, usePage } from "@inertiajs/react";
import { Captcha, captchaData, type CaptchaConfig } from "@particle-academy/fancy-captcha-ui";

export default function Register() {
  const { fancyCaptcha } = usePage<{ fancyCaptcha: CaptchaConfig }>().props;
  const form = useForm({ name: "", email: "", password: "", ...captchaData(fancyCaptcha) });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.post("/register", { onSuccess: () => form.reset() }); }}>
      {/* your fields */}
      <Captcha config={fancyCaptcha} form={form} action="signup" />
      {form.errors.captcha && <p>{form.errors.captcha}</p>}
      <button type="submit" disabled={form.processing}>Create account</button>
    </form>
  );
}
```

`form` is anything with `data` and `setData(key, value)`. The captcha's fields live in the form's
data, so they post with everything else. If it also has `processing` (Inertia's and
fancy-inertia's forms do), the captcha re-arms itself after every submit; see
[Reset after a submit](#reset-after-a-submit).

### `action` must match the route

The shared `fancyCaptcha` prop is the same for every page, so its `action` is `null` (or the
global `fancy-captcha.action`). Give each form its action with the `action` prop, and make it
**the same string as the route's middleware**:

```php
Route::post('/register', RegisterController::class)->middleware('captcha:signup');
```

```tsx
<Captcha config={fancyCaptcha} form={form} action="signup" />
```

Pass `action` as a prop rather than spreading it into the config (`{...fancyCaptcha, action}`):
the prop is the supported way, and it overrides the config's.

A mismatch refuses **every** submit under Turnstile and reCAPTCHA v3, which report the action
the token was solved for. The visitor sees only the generic message; the log line
`fancy-captcha refused a submission.` carries `reason: action_mismatch` and the `action` the
route expected. The built-in mode, hCaptcha and reCAPTCHA v2 do not check the action at all, so
**a mismatch stays hidden until the driver changes**. Set it correctly from the start.

## With fancy-inertia's `useFancyForm`

The same, because `useFancyForm()` has the same `data` and `setData`:

```tsx
import { useFancyForm } from "@particle-academy/fancy-inertia";

const form = useFancyForm({ email: "", ...captchaData(fancyCaptcha) });
<Captcha config={fancyCaptcha} form={form} />
```

## Without a form library

Inside a plain `<form>`, the component renders real named inputs, so a normal POST carries them:

```tsx
<form method="post" action="/contact">
  <Captcha config={props.fancyCaptcha} />
</form>
```

Or give it the provider directly, with a callback:

```tsx
<Captcha provider="turnstile" siteKey="0x4AAA..." action="contact" name="cf_token" onToken={setToken} />
```

## Reset after a submit

**A provider token is single-use**, and so is a proof-of-work solution. And fancy-captcha's
`captcha:<action>` middleware checks them **before your controller validates**, so a submit that
comes back with a validation error ("that email is taken") has already spent what it posted. The
signed `_captcha_started` timestamp is not single-use and is never touched.

So the component re-arms itself after **every** submit, whatever the outcome: when
`form.processing` goes true and then false, it resets the widget (or re-executes reCAPTCHA v3, or
solves a fresh proof-of-work) for whatever that submit posted. Something that was not posted is
left alone: an unsolved widget, or a first proof-of-work still running. This is
`resetAfterSubmit`, on by default:

```tsx
<Captcha config={fancyCaptcha} form={form} action="signup" resetAfterSubmit={false} />
```

Turn it off only if you reset the captcha yourself (`useCaptcha().reset()`). With it off, or with a
form that has no `processing`, a resubmit after a validation error posts a spent token and is
refused.

Clearing the field also resets, as before: `form.reset()` after a successful submit does it, and
the two do not double up. A controlled `value` works the same way: set it to `""` to reset.

Expiry is handled too: an expired or failed widget clears the token, and the status says so.

## Headless

```tsx
const captcha = useCaptcha({ config: fancyCaptcha, form });
// captcha.values: the fields to post, by name
// captcha.widgetRef: attach to the element the widget renders into
// captcha.status, captcha.progress, captcha.reset(), captcha.cancel()
```

## Script loading

The provider's script is inserted **in an effect**, never during render, so the component is
SSR-safe: nothing touches `window` or `document` on the server. It loads **once per URL** however
many captchas are on the page, and is reused when the provider's API is already there.
`scriptUrl` loads it from somewhere else, such as a self-hosted copy.

## Proof-of-work

When the server enables it, the component fetches a challenge from `GET /fancy-captcha/challenge`
and searches for the answer **in a Web Worker** built from a Blob, so the page never blocks. Progress
shows as a react-fancy `Progress` bar and is announced in a polite live region at quarter steps.
`useCaptcha().cancel()` stops it; unmounting stops it too.

If a Worker cannot be made (no Worker support, or a Content-Security-Policy without
`worker-src blob:`), the search runs on the main thread in 8 ms slices, so the page stays
responsive, only slower. To keep the Worker under a strict CSP, add `worker-src blob:`.

A challenge from the server is checked before any work starts: an id of 22 base64url characters
and a difficulty of 8 to 32 bits. Anything else is refused rather than searched.

## Consent (optional, with fancy-compliance-ui)

When the server sets `fancy-captcha.consent.category`, the provider renders **only after that
category is granted**. Until then, and whenever it is refused or withdrawn, the built-in check
renders instead, with proof-of-work. The provider's script is not loaded and its API is not used
before consent.

```tsx
import { useConsent } from "@particle-academy/fancy-compliance-ui";

<Captcha config={fancyCaptcha} form={form} consent={useConsent()} />
```

This is a **soft** integration: the package never imports fancy-compliance-ui and does not list
it as a dependency. `consent` is anything with `allows(category): boolean`, which
`useConsent()` returns. A gated provider with no `consent` given counts as not granted.

## Accessibility

What this package renders is held to WCAG 2.2 AAA where it can be:

- **The honeypot is hidden from everyone but bots**: its wrapper is `aria-hidden` and `inert`, the
  input is `tabindex="-1"` and `autocomplete="off"`, and it is moved off-screen on the inline axis
  and clipped. Keyboard and screen-reader users never meet it.
- **Proof-of-work progress** is a labelled progress bar plus a polite, atomic `role="status"`
  region that announces at 0, 25, 50 and 75% and on completion, rather than every percent.
- Status text uses react-fancy's default text colour, above 7:1 on its surface.
- Every visible or announced string goes through `messages`, falling back to English.

**Third-party widgets are not ours.** Turnstile, reCAPTCHA and hCaptcha render their own UI, in
their own iframes, with their own accessibility. We cannot make them AAA, and some of their
challenges are hard or impossible for some disabled people. If that matters for your form, keep
the built-in mode.

## RTL

Pass `dir="rtl"`, or let it inherit from the page. The honeypot is positioned with
`inset-inline-start`, so in RTL it leaves through the right edge, which adds no scrollbar.
Provider widgets follow their own language settings.

## Agents (Human+)

An agent may read a captcha's state: the root carries `data-fancy-captcha`,
`data-fancy-captcha-provider`, `data-fancy-captcha-mode` and `data-fancy-captcha-status`, and
`onStatusChange` reports every change.

**An agent must never solve or submit a captcha for a person.** Telling people and automation
apart is the only thing a captcha is for, so there is no MCP bridge that writes, and any bridge
written for it must be read-only.

## Tailwind

Like every Fancy package, the classes ship in `dist`. Point Tailwind v4 at it:

```css
@source "../node_modules/@particle-academy/fancy-captcha-ui/dist/**/*.js";
```

The honeypot is also hidden with an inline style, so it stays hidden without this.

## Licence

MIT.
