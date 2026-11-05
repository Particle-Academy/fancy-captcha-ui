import { useId } from "react";
import { Progress, Text } from "@particle-academy/react-fancy";
import { useCaptcha, type UseCaptchaOptions } from "./useCaptcha";
import type { Direction } from "./types";

export interface CaptchaProps extends UseCaptchaOptions {
  /** A stable id for the root, for hosts and agents that read status. */
  id?: string;
  /** Writing direction. Leave unset to inherit from the page. */
  dir?: Direction;
  className?: string;
}

/**
 * Off-screen on the INLINE axis, so under RTL it moves off the right edge
 * (which does not scroll) rather than adding a horizontal scrollbar, and
 * clipped as well. Inline style, so it holds without the host's Tailwind
 * scanning this package; the classes repeat it for a strict CSP that drops
 * server-rendered style attributes.
 */
const HONEYPOT_STYLE = {
  position: "absolute",
  insetInlineStart: "-10000px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const;

const HONEYPOT_CLASS = "absolute -start-[10000px] h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]";

/** Text on the default surface: zinc-900 on white, zinc-100 on zinc-900, both above 7:1 (AAA). */
const STATUS_CLASS = "mt-2 empty:hidden";

/**
 * One captcha for every provider. Drop it inside a form:
 *
 *     <Captcha config={fancyCaptcha} form={form} />
 *
 * Built-in mode renders the honeypot and the signed timestamp, and solves the
 * proof-of-work in a Web Worker when the server asks for one. Provider modes
 * load the provider's script lazily, after mount (and, when gated, only after
 * consent), render its widget, and post its token in a hidden field. Clearing
 * the token from the form (as `form.reset()` does after a submit) resets the
 * widget, because a provider token can be used once.
 *
 * Agents may READ the status from the `data-fancy-captcha-*` attributes. Nothing
 * here lets an agent solve or submit a captcha for a person, and nothing should.
 */
export function Captcha({ id, dir, className, ...options }: CaptchaProps) {
  const state = useCaptcha(options);
  const honeypotId = `${useId()}-hp`;
  const { fields, values, mode, status, t } = state;

  return (
    <div
      id={id}
      dir={dir}
      className={className}
      data-fancy-captcha=""
      data-fancy-captcha-provider={state.provider}
      data-fancy-captcha-mode={mode}
      data-fancy-captcha-status={status}
    >
      <div data-fancy-captcha-honeypot="" aria-hidden="true" inert style={HONEYPOT_STYLE} className={HONEYPOT_CLASS}>
        {/* react-fancy 6.11's TextProps extends HTMLAttributes<HTMLElement>, so `as="label"`
            cannot type `htmlFor`; it does forward it. Spread until TextProps widens. */}
        <Text as="label" {...({ htmlFor: honeypotId } as object)}>
          {t("fancy-captcha.honeypot.label")}
        </Text>
        <input
          id={honeypotId}
          type="text"
          name={fields.honeypot}
          tabIndex={-1}
          autoComplete="off"
          value={values[fields.honeypot] ?? ""}
          onChange={(event) => state.setHoneypot(event.target.value)}
        />
      </div>

      <input type="hidden" name={fields.started} value={values[fields.started] ?? ""} />
      {state.powEnabled && <input type="hidden" name={fields.pow} value={values[fields.pow] ?? ""} />}
      {mode !== "builtin" && <input type="hidden" name={fields.token} value={values[fields.token] ?? ""} />}

      {mode === "widget" && state.configured && <div ref={state.widgetRef} data-fancy-captcha-widget="" />}

      {state.powEnabled && status === "solving" && (
        <Progress value={Math.round(state.progress * 100)} max={100} size="sm" aria-label={t("fancy-captcha.pow.label")} className="mt-2" />
      )}

      <Text as="p" size="sm" role="status" aria-live="polite" aria-atomic="true" className={STATUS_CLASS}>
        {state.announcement}
      </Text>
    </div>
  );
}
