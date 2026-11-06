import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Captcha, captchaData, type CaptchaConfig, type CaptchaForm } from "../src";
import { CHALLENGE_ID, cleanupDom, config, fakeForm, flush, mockChallengeFetch, mount, serverAccepts, until, type Mounted } from "./helpers";
import { installFakeApi } from "./providers";

/**
 * fancy-captcha's `captcha:<action>` middleware verifies BEFORE the controller
 * validates. So a submit refused by the app's own validation ("email taken")
 * has already spent what it posted:
 *
 *  - a provider token: siteverify was called with it, and Turnstile, reCAPTCHA
 *    and hCaptcha each accept a token once;
 *  - a proof-of-work solution: `ProofOfWork::redeem()` adds the spent marker
 *    before it checks the hash.
 *
 * The signed `_captcha_started` timestamp is NOT single-use (`FormTimestamp::age`
 * only checks 3 s .. 6 h), so it is left alone.
 *
 * Nothing clears the field on an error, so the widget has to re-arm itself when
 * Inertia's `form.processing` goes true and then false.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanupDom();
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

/** Shaped like Inertia's useForm(): data, setData and processing. */
function inertiaForm(initial: Record<string, string>) {
  return Object.assign(fakeForm(initial), { processing: false });
}

type InertiaForm = ReturnType<typeof inertiaForm>;

/** One submit round trip, the way Inertia renders it: processing on, then off, nothing cleared (a validation error). */
async function submit(view: Mounted, render: () => ReactNode, form: InertiaForm, onFinish?: () => void) {
  form.processing = true;
  await view.rerender(render());
  form.processing = false;
  onFinish?.();
  await view.rerender(render());
  await flush();
}

const turnstile = () => config({ provider: "turnstile", siteKey: "site-key-public", action: "signup" });

describe("re-arming after a submit (the token is spent before validation)", () => {
  it("resets the Turnstile widget and clears the spent token after a refused submit", async () => {
    const api = installFakeApi("turnstile");
    const form = inertiaForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} />;
    const view = await mount(render());
    await flush();
    await api.widgets[0]!.solve("tok-1");
    await view.rerender(render());

    await submit(view, render, form);

    expect(api.resets).toEqual(["widget-0"]);
    expect(form.data._captcha_token).toBe("");
    expect(document.querySelector("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("ready");
  });

  it("re-arms once per submit, and does not loop", async () => {
    const api = installFakeApi("turnstile");
    const form = inertiaForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} />;
    const view = await mount(render());
    await flush();
    await api.widgets[0]!.solve("tok-1");
    await view.rerender(render());
    await submit(view, render, form);

    for (let i = 0; i < 5; i++) await view.rerender(render());
    await flush(10);
    expect(api.resets).toEqual(["widget-0"]);

    // The person solves again and the second submit is refused too.
    await api.widgets[0]!.solve("tok-2");
    await view.rerender(render());
    expect(form.data._captcha_token).toBe("tok-2");
    await submit(view, render, form);

    expect(api.resets).toEqual(["widget-0", "widget-0"]);
    expect(form.data._captcha_token).toBe("");
  });

  it("resets ONCE when the host's form.reset() already cleared the token on success", async () => {
    const api = installFakeApi("turnstile");
    const form = inertiaForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} />;
    const view = await mount(render());
    await flush();
    await api.widgets[0]!.solve("tok-1");
    await view.rerender(render());

    await submit(view, render, form, () => form.setData("_captcha_token", ""));

    expect(api.resets).toEqual(["widget-0"]);
  });

  it("leaves an unsolved widget alone: nothing was posted, so nothing was spent", async () => {
    const api = installFakeApi("turnstile");
    const form = inertiaForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} />;
    const view = await mount(render());
    await flush();

    await submit(view, render, form);

    expect(api.resets).toEqual([]);
  });

  it("can be turned off with resetAfterSubmit={false}", async () => {
    const api = installFakeApi("turnstile");
    const form = inertiaForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} resetAfterSubmit={false} />;
    const view = await mount(render());
    await flush();
    await api.widgets[0]!.solve("tok-1");
    await view.rerender(render());

    await submit(view, render, form);

    expect(api.resets).toEqual([]);
    expect(form.data._captcha_token).toBe("tok-1");
  });

  it("executes reCAPTCHA v3 again for a fresh token", async () => {
    const api = installFakeApi("grecaptcha");
    const cfg = config({ provider: "recaptcha-v3", siteKey: "rk3", action: "signup" });
    const form = inertiaForm(captchaData(cfg));
    const render = () => <Captcha config={cfg} form={form} />;
    const view = await mount(render());
    await flush();
    await view.rerender(render());
    expect(form.data._captcha_token).toBe("v3-token-1");

    await submit(view, render, form);

    expect(api.executes).toHaveLength(2);
    expect(form.data._captcha_token).toBe("v3-token-2");
  });

  it("still works with a form that has no processing flag (it just cannot re-arm on its own)", async () => {
    const api = installFakeApi("turnstile");
    const form: CaptchaForm & { data: Record<string, string> } = fakeForm(captchaData(turnstile()));
    const render = () => <Captcha config={turnstile()} form={form} />;
    const view = await mount(render());
    await flush();
    await api.widgets[0]!.solve("tok-1");
    for (let i = 0; i < 3; i++) await view.rerender(render());

    expect(api.resets).toEqual([]);
    expect(form.data._captcha_token).toBe("tok-1");
  });
});

describe("re-arming the built-in proof-of-work after a submit", () => {
  const powConfig = (): CaptchaConfig => config({ pow: { enabled: true, difficulty: 8, challengeUrl: "/fancy-captcha/challenge" } });
  const SECOND = "ZyXwVuTsRqPoNmLkJiHgFe";

  it("solves a fresh challenge, because the server burned the first one", async () => {
    const calls = mockChallengeFetch([
      { id: CHALLENGE_ID, difficulty: 8, expiresIn: 300, algorithm: "sha256-leading-zero-bits" },
      { id: SECOND, difficulty: 8, expiresIn: 300, algorithm: "sha256-leading-zero-bits" },
    ]);
    const form = inertiaForm(captchaData(powConfig()));
    const started = form.data._captcha_started;
    const render = () => <Captcha config={powConfig()} form={form} />;
    const view = await mount(render());
    await until(() => form.data._captcha_pow !== "");
    await view.rerender(render());

    await submit(view, render, form);
    await until(() => form.data._captcha_pow.startsWith(`${SECOND}:`));

    expect(calls).toHaveLength(2);
    expect(serverAccepts(form.data._captcha_pow, 8)).toBe(true);
    // The signed timestamp is not single-use, so it is not touched.
    expect(form.data._captcha_started).toBe(started);

    // And no loop: nothing else is fetched.
    for (let i = 0; i < 3; i++) await view.rerender(render());
    await flush(10);
    expect(calls).toHaveLength(2);
  });

  it("does not restart a proof-of-work that is still being solved for the first time", async () => {
    const calls = mockChallengeFetch();
    const workers: Array<{ terminated: boolean }> = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      terminated = false;
      constructor() {
        workers.push(this);
      }
      postMessage() {}
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:fake-worker", revokeObjectURL: () => undefined }));
    const form = inertiaForm(captchaData(powConfig()));
    const render = () => <Captcha config={powConfig()} form={form} />;
    const view = await mount(render());
    await until(() => workers.length === 1);

    await submit(view, render, form);

    expect(calls).toHaveLength(1);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
  });

  it("does nothing in built-in mode without proof-of-work: nothing there is single-use", async () => {
    const calls = mockChallengeFetch();
    const form = inertiaForm(captchaData(config()));
    const render = () => <Captcha config={config()} form={form} />;
    const view = await mount(render());
    const before = form.calls.length;

    await submit(view, render, form);

    expect(calls).toEqual([]);
    expect(form.calls.length).toBe(before);
  });
});
