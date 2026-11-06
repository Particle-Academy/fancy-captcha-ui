import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { fieldNames } from "./fields";
import { createTranslator, type Translate } from "./messages";
import { fetchChallenge, startPow, type PowHandle } from "./pow";
import { ADAPTERS, providerApi, type WidgetApi, type WidgetId } from "./providers";
import type {
  CaptchaConfig,
  CaptchaConsent,
  CaptchaFieldNames,
  CaptchaForm,
  CaptchaMessages,
  CaptchaMode,
  CaptchaProvider,
  CaptchaStatus,
} from "./types";

export interface UseCaptchaOptions {
  /** The server's props (`fancyCaptcha` from Inertia, or `Captcha::props()`). */
  config?: CaptchaConfig;
  /** Override or replace the config's provider, site key and action. */
  provider?: CaptchaProvider;
  siteKey?: string;
  action?: string;
  /** The token field's name. Default: the config's, else `_captcha_token`. */
  name?: string;
  /** Inertia `useForm()` or fancy-inertia `useFancyForm()`: the fields live in its data. */
  form?: CaptchaForm;
  /** Controlled provider token. Clearing it (after a submit) resets the widget. */
  value?: string;
  onToken?: (token: string) => void;
  /** Pass fancy-compliance-ui's `useConsent()`. Required to show a gated provider. */
  consent?: CaptchaConsent;
  /** The consent category gating the provider. Default: the config's. */
  consentCategory?: string;
  /** Load the provider script from here instead (a self-hosted copy, a test page). */
  scriptUrl?: string;
  /** Passed to the widget: `light`, `dark` or `auto`. */
  theme?: "light" | "dark" | "auto";
  onStatusChange?: (status: CaptchaStatus) => void;
  messages?: CaptchaMessages;
  /**
   * With a `form` that has `processing`: once a submit finishes (`processing`
   * goes true, then false), reset the widget, re-execute reCAPTCHA v3, or solve
   * a fresh proof-of-work for whatever that submit posted. Whatever the outcome,
   * because fancy-captcha's middleware spends the token before the app
   * validates, so a validation error leaves a spent token in the form.
   * Default `true`.
   */
  resetAfterSubmit?: boolean;
}

export interface CaptchaState {
  /** The provider in use for this render: the configured one, or `builtin` when consent is missing. */
  provider: CaptchaProvider;
  mode: CaptchaMode;
  status: CaptchaStatus;
  /** Proof-of-work progress, 0..1. An estimate: the work is random, so it holds at 95% until solved. */
  progress: number;
  fields: CaptchaFieldNames;
  /** The fields this mode posts, by name. */
  values: Record<string, string>;
  powEnabled: boolean;
  configured: boolean;
  /** Attach to the element the provider widget renders into. */
  widgetRef: RefObject<HTMLDivElement | null>;
  setHoneypot: (value: string) => void;
  /** Reset the widget, or start a fresh proof-of-work. */
  reset: () => void;
  /** Stop a running proof-of-work. */
  cancel: () => void;
  /** What the live region announces now ("" for nothing). */
  announcement: string;
  t: Translate;
}

/** Tracks a field this hook wrote, to tell "the host cleared it" apart from "not written yet". */
function useConsumed(current: string, onConsumed: () => void) {
  const written = useRef("");
  const seen = useRef(false);
  const callback = useRef(onConsumed);
  callback.current = onConsumed;

  useEffect(() => {
    if (written.current !== "" && current === written.current) {
      seen.current = true;
    } else if (seen.current && current === "") {
      seen.current = false;
      written.current = "";
      callback.current();
    }
  });

  return useCallback((value: string) => {
    written.current = value;
    seen.current = false;
  }, []);
}

/**
 * Everything `<Captcha>` does, without the markup. Render the hidden fields
 * from `values` and attach `widgetRef` yourself.
 */
export function useCaptcha(options: UseCaptchaOptions): CaptchaState {
  const { config, form, value, consent } = options;
  const fields = fieldNames(config, options.name);
  const configured_ = options.provider ?? config?.provider ?? "builtin";
  const siteKey = options.siteKey ?? config?.siteKey ?? null;
  const action = options.action ?? config?.action ?? null;
  const category = options.consentCategory ?? config?.consentCategory ?? null;

  // The consent gate. A gated provider with no answer counts as NOT granted.
  const gated = configured_ !== "builtin" && category !== null;
  const allowed = !gated || consent?.allows(category) === true;
  const configured = configured_ === "builtin" || ((config?.configured ?? true) && !!siteKey);
  const provider: CaptchaProvider = allowed ? configured_ : "builtin";
  const mode: CaptchaMode = provider === "builtin" ? "builtin" : ADAPTERS[provider].invisible ? "invisible" : "widget";
  const challengeUrl = config?.pow.challengeUrl ?? null;
  const powEnabled = mode === "builtin" && (config?.pow.enabled ?? false) && challengeUrl !== null;

  const [own, setOwn] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<CaptchaStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [powRound, setPowRound] = useState(0);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: WidgetApi; id: WidgetId | null } | null>(null);
  const powHandle = useRef<PowHandle | null>(null);
  const t = useMemo(() => createTranslator(options.messages), [options.messages]);

  const read = (name: string): string => {
    if (name === fields.token && value !== undefined) return value;
    const source = form ? (form.data as Record<string, unknown>) : own;
    const found = source[name];

    return typeof found === "string" ? found : "";
  };

  // The latest props, for callbacks handed to a provider long before this render.
  const latest = useRef({ form, onToken: options.onToken, fields });
  latest.current = { form, onToken: options.onToken, fields };

  const write = useCallback((name: string, next: string) => {
    const { form: currentForm, onToken, fields: names } = latest.current;
    if (currentForm) currentForm.setData(name, next);
    else setOwn((previous) => ({ ...previous, [name]: next }));
    if (name === names.token) onToken?.(next);
  }, []);

  const token = read(fields.token);
  const solution = read(fields.pow);
  const markToken = useConsumed(token, () => resetWidget());
  const markPow = useConsumed(solution, () => setPowRound((round) => round + 1));

  const writeToken = useCallback(
    (next: string) => {
      markToken(next);
      write(latest.current.fields.token, next);
    },
    [markToken, write],
  );

  // The signed timestamp: put it into a form that was not seeded with it.
  const started = read(fields.started) || config?.started || "";
  useEffect(() => {
    if (form && config?.started && read(fields.started) === "") form.setData(fields.started, config.started);
    // Once per mount and per server timestamp; `form` changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.started, fields.started]);

  // Built-in without proof-of-work: nothing to wait for.
  useEffect(() => {
    if (mode === "builtin" && !powEnabled) setStatus("ready");
  }, [mode, powEnabled]);

  // Proof-of-work: fetch, solve off the main thread, write the solution.
  useEffect(() => {
    if (!powEnabled || challengeUrl === null) return;
    const controller = new AbortController();
    let cancelled = false;
    setStatus("solving");
    setProgress(0);
    fetchChallenge(challengeUrl, controller.signal)
      .then((challenge) => {
        if (cancelled) return;
        const expected = 2 ** challenge.difficulty;
        powHandle.current = startPow(`${challenge.id}:`, challenge.difficulty, {
          onProgress: (attempts) => {
            if (!cancelled) setProgress(Math.min(0.95, attempts / expected));
          },
          onSolved: (nonce) => {
            if (cancelled) return;
            const answer = `${challenge.id}:${nonce}`;
            markPow(answer);
            write(latest.current.fields.pow, answer);
            setProgress(1);
            setStatus("solved");
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
      powHandle.current?.cancel();
      powHandle.current = null;
    };
  }, [powEnabled, challengeUrl, powRound, markPow, write]);

  // The provider widget: load lazily, render, clean up. Never before consent.
  const scriptUrl = options.scriptUrl;
  const theme = options.theme;
  useEffect(() => {
    if (provider === "builtin") return;
    if (!configured || !siteKey) {
      setStatus("unconfigured");

      return;
    }
    const adapter = ADAPTERS[provider];
    let cancelled = false;
    let refresh: ReturnType<typeof setInterval> | null = null;
    setStatus("loading");

    const execute = (api: WidgetApi) =>
      api.execute!(siteKey, action ? { action } : {}).then(
        (next) => {
          if (cancelled) return;
          writeToken(next);
          setStatus("solved");
        },
        () => {
          if (!cancelled) setStatus("error");
        },
      );

    providerApi(adapter, scriptUrl ?? adapter.scriptUrl(siteKey))
      .then((api) => {
        if (cancelled) return;
        if (adapter.invisible) {
          widget.current = { api, id: null };
          void execute(api);
          // v3 tokens live two minutes; keep a fresh one in the form.
          refresh = setInterval(() => void execute(api), 100_000);

          return;
        }
        const container = widgetRef.current;
        if (!container) return;
        const id = api.render(
          container,
          adapter.options(siteKey, action, theme, {
            token: (next) => {
              if (cancelled) return;
              writeToken(next);
              setStatus("solved");
            },
            expired: () => {
              if (cancelled) return;
              writeToken("");
              setStatus("expired");
            },
            error: () => {
              if (cancelled) return;
              writeToken("");
              setStatus("error");
            },
          }),
        );
        widget.current = { api, id };
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (refresh !== null) clearInterval(refresh);
      const current = widget.current;
      widget.current = null;
      if (current && current.id !== null && adapter.remove) current.api.remove?.(current.id);
    };
  }, [provider, configured, siteKey, action, scriptUrl, theme, writeToken]);

  // Declared as a function so useConsumed (above) can call it.
  function resetWidget() {
    const current = widget.current;
    if (!current || provider === "builtin") return;
    if (ADAPTERS[provider].invisible) {
      current.api.execute!(siteKey!, action ? { action } : {}).then(
        (next) => {
          writeToken(next);
          setStatus("solved");
        },
        () => setStatus("error"),
      );

      return;
    }
    if (current.id !== null) current.api.reset(current.id);
    setStatus("ready");
  }

  // Re-arm after a submit. fancy-captcha's middleware verifies before the
  // controller validates, so by the time a validation error comes back the
  // posted token has been sent to siteverify and the posted proof-of-work has
  // been marked spent. Nothing clears the field on an error, so watch the
  // submit itself: note what was posted when `processing` rises, and re-arm
  // that when it falls. Edge-triggered, so it runs once per submit.
  //  - Only what was posted: an empty field (an unsolved widget, a first
  //    proof-of-work still running) was not spent and is left alone.
  //  - Only if it is still in the form: a host whose `form.reset()` already
  //    cleared it has triggered useConsumed's reset, and a field replaced by a
  //    fresh value (a v3 refresh mid-submit) is not the spent one.
  //  - Never the signed timestamp: the server does not make it single-use.
  const processing = options.resetAfterSubmit === false ? undefined : form?.processing;
  const posted = useRef<{ token: string; solution: string } | null>(null);
  const rearm = useRef<() => void>(() => undefined);
  rearm.current = () => {
    const sent = posted.current;
    posted.current = null;
    if (!sent) return;
    if (mode !== "builtin" && sent.token !== "" && token === sent.token) {
      writeToken("");
      resetWidget();
    }
    if (powEnabled && sent.solution !== "" && solution === sent.solution) {
      markPow("");
      write(fields.pow, "");
      setPowRound((round) => round + 1);
    }
  };
  useEffect(() => {
    if (processing === true && posted.current === null) {
      posted.current = { token, solution };
    } else if (processing !== true && posted.current !== null) {
      rearm.current();
    }
  });

  const onStatusChange = useRef(options.onStatusChange);
  onStatusChange.current = options.onStatusChange;
  useEffect(() => {
    onStatusChange.current?.(status);
  }, [status]);

  const reset = useCallback(() => {
    if (mode === "builtin") {
      if (powEnabled) setPowRound((round) => round + 1);
    } else {
      resetWidget();
    }
    // resetWidget reads refs and the current render's values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, powEnabled, provider, siteKey, action]);

  const cancel = useCallback(() => {
    if (powHandle.current) {
      powHandle.current.cancel();
      powHandle.current = null;
      setStatus("cancelled");
    }
  }, []);

  const values: Record<string, string> = { [fields.honeypot]: read(fields.honeypot), [fields.started]: started };
  if (powEnabled) values[fields.pow] = solution;
  if (mode !== "builtin") values[fields.token] = token;

  return {
    provider,
    mode,
    status,
    progress,
    fields,
    values,
    powEnabled,
    configured,
    widgetRef,
    setHoneypot: (next) => write(fields.honeypot, next),
    reset,
    cancel,
    announcement: announce(status, mode, powEnabled, progress, t),
    t,
  };
}

function announce(status: CaptchaStatus, mode: CaptchaMode, pow: boolean, progress: number, t: Translate): string {
  if (status === "unconfigured") return t("fancy-captcha.unconfigured");
  if (mode === "builtin") {
    if (!pow) return "";
    switch (status) {
      // Quarter steps: a polite region that changed every percent would talk over the form.
      case "solving":
        return t("fancy-captcha.pow.solving", { percent: Math.floor(progress * 4) * 25 });
      case "solved":
        return t("fancy-captcha.pow.done");
      case "error":
        return t("fancy-captcha.pow.error");
      case "cancelled":
        return t("fancy-captcha.pow.cancelled");
      default:
        return "";
    }
  }
  if (status === "error") return t("fancy-captcha.widget.error");
  if (status === "expired") return t("fancy-captcha.widget.expired");

  return "";
}
