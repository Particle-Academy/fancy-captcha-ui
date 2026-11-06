# fancy-captcha-ui code map

React 19 captcha built from `@particle-academy/react-fancy` (peer, `>=6.11.0 <7.0.0`). The data
contract is `CaptchaConfig` in `src/types.ts`, which mirrors `particle-academy/fancy-captcha`'s
`CaptchaManager::props()`.

## Where things are

- `src/useCaptcha.ts`: all behaviour. Consent gate, field reads and writes (form adapter,
  controlled `value`, or own state), the proof-of-work effect, the provider effect, and
  `useConsumed`, which tells "the host cleared a field we wrote" from "not written yet".
- `src/Captcha.tsx`: markup only. Honeypot, hidden fields, widget container, `Progress`, the
  live region.
- `src/pow.ts`: `createPowEngine` (SHA-256 and the search), `workerSource`, `startPow`
  (Worker from a Blob, main-thread slices as the fallback), `fetchChallenge`.
- `src/providers.ts`: per-provider script URL and render options, `loadScript` (once per URL),
  `providerApi`.
- `src/fields.ts`: `CAPTCHA_FIELDS` (same values as the server's `FancyCaptcha\Fields`),
  `captchaData`.
- `src/messages.ts`: `DEFAULT_MESSAGES` and the translator.

## Invariants a change must keep

- **`createPowEngine` is self-contained.** It runs from its own `.toString()` in a Worker. No
  imports, no outer references. `tests/engine.test.ts` rebuilds it from text.
- **No `window` or `document` during render.** Scripts load in effects only.
- **A gated provider never loads or renders before `consent.allows(category)` is true**, and
  no `consent` means not granted.
- **Clearing a token or solution the component wrote resets the widget or re-solves.**
- **A finished submit re-arms what it posted, once** (`resetAfterSubmit`, on by default): edge-
  triggered on `form.processing` true then false, only for a non-empty token or solution that is
  still in the form. Never the signed timestamp, which the server does not make single-use.
  `tests/resubmit.test.tsx`.
- **The honeypot stays `aria-hidden` + `inert`, `tabIndex=-1`, `autoComplete="off"`, offset on
  the inline axis.**
- **Agents read, never solve.** No export may produce a token or solution on a person's behalf
  except the built-in solver running in that person's browser for that person's form.
- **No import of fancy-compliance-ui, Inertia or fancy-inertia.** Both integrations are
  structural; `tests/packaging.test.ts` checks the sources.
- Every visible string goes through `t()`.

## Tests

vitest + jsdom with `createRoot`/`act` (`tests/helpers.tsx`). Provider APIs are stand-ins in
`tests/providers.tsx`; jsdom never fetches a script. Solutions are checked with `node:crypto`.
`npm run lint` is `tsc` + the rules-of-hooks ESLint.
