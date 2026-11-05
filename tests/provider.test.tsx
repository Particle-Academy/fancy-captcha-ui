import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Captcha, captchaData } from "../src";
import { cleanupDom, config, fakeForm, flush, input, mount, q } from "./helpers";
import { installFakeApi, loadScripts } from "./providers";

afterEach(() => cleanupDom());

const turnstile = (overrides = {}) => config({ provider: "turnstile", siteKey: "site-key-public", action: "signup", ...overrides });

function scripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>("script[data-fancy-captcha-script]"));
}

describe("loading the provider script", () => {
  it("does not touch the DOM or window during server rendering", () => {
    const html = renderToString(<Captcha config={turnstile()} />);

    expect(scripts()).toHaveLength(0);
    expect(html).toContain('name="_captcha_started"');
    expect(html).toContain('data-fancy-captcha-status="idle"');
  });

  it("loads lazily, from the provider's documented explicit-render URL", async () => {
    await mount(<Captcha config={turnstile()} />);

    expect(scripts().map((s) => s.src)).toEqual(["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]);
    expect(scripts()[0]!.async).toBe(true);
  });

  it("loads the script ONCE for several widgets", async () => {
    await mount(
      <>
        <Captcha config={turnstile()} />
        <Captcha config={turnstile()} />
      </>,
    );
    expect(scripts()).toHaveLength(1);

    // The script runs and defines the API; both widgets render from it.
    const api = installFakeApi("turnstile");
    await loadScripts();
    await flush();

    expect(api.widgets).toHaveLength(2);
    expect(scripts()).toHaveLength(1);
  });

  it("reuses an API that is already on the page", async () => {
    const api = installFakeApi("turnstile");
    await mount(<Captcha config={turnstile()} />);
    await flush();

    expect(api.widgets).toHaveLength(1);
  });

  it("can load from a host-supplied URL (a self-hosted or test copy)", async () => {
    await mount(<Captcha config={turnstile()} scriptUrl="/vendor/turnstile.js" />);

    expect(scripts()[0]!.getAttribute("src")).toBe("/vendor/turnstile.js");
  });

  it("reports an error, and posts no token, when the script fails to load", async () => {
    await mount(<Captcha config={turnstile()} />);
    await import("react").then(({ act }) => act(async () => scripts()[0]!.dispatchEvent(new Event("error"))));
    await flush();

    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("error");
    expect(input("_captcha_token")?.value).toBe("");
    expect(q('[role="status"]')?.textContent).toBe("The check could not load. Reload the page and try again.");
  });
});

describe("Turnstile", () => {
  it("renders the widget with the site key and action, and passes the token on", async () => {
    const api = installFakeApi("turnstile");
    const tokens: string[] = [];
    await mount(<Captcha config={turnstile()} onToken={(t) => tokens.push(t)} />);
    await flush();

    expect(api.widgets[0]!.options).toMatchObject({ sitekey: "site-key-public", action: "signup" });
    await api.widgets[0]!.solve("tok-1");

    expect(tokens).toEqual(["tok-1"]);
    expect(input("_captcha_token")?.value).toBe("tok-1");
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("solved");
  });

  it("clears the token when it expires or errors", async () => {
    const api = installFakeApi("turnstile");
    const tokens: string[] = [];
    await mount(<Captcha config={turnstile()} onToken={(t) => tokens.push(t)} />);
    await flush();
    await api.widgets[0]!.solve("tok-1");

    await api.widgets[0]!.expire();
    expect(tokens.at(-1)).toBe("");
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("expired");

    await api.widgets[0]!.solve("tok-2");
    await api.widgets[0]!.error();
    expect(tokens.at(-1)).toBe("");
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("error");
  });

  it("RESETS the widget when the form clears the token, because a token is single-use", async () => {
    const api = installFakeApi("turnstile");
    const form = fakeForm(captchaData(turnstile()));
    const view = await mount(<Captcha config={turnstile()} form={form} />);
    await flush();
    await api.widgets[0]!.solve("tok-1");
    expect(form.data._captcha_token).toBe("tok-1");
    await view.rerender(<Captcha config={turnstile()} form={form} />);
    expect(api.resets).toEqual([]);

    // A successful submit: the host's form.reset() clears the field.
    form.setData("_captcha_token", "");
    await view.rerender(<Captcha config={turnstile()} form={form} />);

    expect(api.resets).toEqual(["widget-0"]);
  });

  it("resets with a controlled value too", async () => {
    const api = installFakeApi("turnstile");
    let value = "";
    const view = await mount(<Captcha config={turnstile()} value={value} onToken={(t) => (value = t)} />);
    await flush();
    await api.widgets[0]!.solve("tok-1");
    await view.rerender(<Captcha config={turnstile()} value={value} onToken={(t) => (value = t)} />);

    await view.rerender(<Captcha config={turnstile()} value="" onToken={(t) => (value = t)} />);

    expect(api.resets).toEqual(["widget-0"]);
  });

  it("removes the widget on unmount", async () => {
    const api = installFakeApi("turnstile");
    const view = await mount(<Captcha config={turnstile()} />);
    await flush();
    await view.unmount();

    expect(api.removes).toEqual(["widget-0"]);
  });
});

describe("reCAPTCHA and hCaptcha", () => {
  it("renders reCAPTCHA v2 explicitly with its callbacks", async () => {
    const api = installFakeApi("grecaptcha");
    await mount(<Captcha config={config({ provider: "recaptcha-v2", siteKey: "rk" })} />);
    await flush();

    expect(api.widgets[0]!.options).toMatchObject({ sitekey: "rk" });
    expect(typeof api.widgets[0]!.options["expired-callback"]).toBe("function");
    await api.widgets[0]!.solve("g-tok");
    expect(input("_captcha_token")?.value).toBe("g-tok");
  });

  it("loads reCAPTCHA v3 with the site key, executes the action, and renders no widget", async () => {
    await mount(<Captcha config={config({ provider: "recaptcha-v3", siteKey: "rk3", action: "signup" })} />);
    expect(scripts()[0]!.src).toBe("https://www.google.com/recaptcha/api.js?render=rk3");

    const api = installFakeApi("grecaptcha");
    await loadScripts();
    await flush();

    expect(api.widgets).toEqual([]);
    expect(api.executes).toEqual([{ siteKey: "rk3", action: "signup" }]);
    expect(input("_captcha_token")?.value).toBe("v3-token-1");
  });

  it("executes reCAPTCHA v3 again when the token is consumed", async () => {
    const api = installFakeApi("grecaptcha");
    const form = fakeForm(captchaData(config()));
    const cfg = config({ provider: "recaptcha-v3", siteKey: "rk3", action: "signup" });
    const view = await mount(<Captcha config={cfg} form={form} />);
    await flush();
    await view.rerender(<Captcha config={cfg} form={form} />);
    expect(form.data._captcha_token).toBe("v3-token-1");

    form.setData("_captcha_token", "");
    await view.rerender(<Captcha config={cfg} form={form} />);
    await flush();

    expect(api.executes).toHaveLength(2);
    expect(form.data._captcha_token).toBe("v3-token-2");
  });

  it("renders hCaptcha explicitly, and resets it when the token is consumed", async () => {
    const api = installFakeApi("hcaptcha");
    const form = fakeForm(captchaData(config()));
    const cfg = config({ provider: "hcaptcha", siteKey: "hk" });
    const view = await mount(<Captcha config={cfg} form={form} />);
    await flush();
    expect(scripts()).toHaveLength(0);
    expect(api.widgets[0]!.options).toMatchObject({ sitekey: "hk" });

    await api.widgets[0]!.solve("h-tok");
    await view.rerender(<Captcha config={cfg} form={form} />);
    form.setData("_captcha_token", "");
    await view.rerender(<Captcha config={cfg} form={form} />);

    expect(api.resets).toEqual(["widget-0"]);
  });

  it("uses props instead of server config when given them directly", async () => {
    const api = installFakeApi("turnstile");
    await mount(<Captcha provider="turnstile" siteKey="direct-key" action="contact" name="cf_token" />);
    await flush();

    expect(api.widgets[0]!.options).toMatchObject({ sitekey: "direct-key", action: "contact" });
    await api.widgets[0]!.solve("t");
    expect(input("cf_token")?.value).toBe("t");
  });
});

describe("an unconfigured provider", () => {
  it("says so, and loads nothing", async () => {
    await mount(<Captcha config={turnstile({ siteKey: null, configured: false })} />);

    expect(scripts()).toHaveLength(0);
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("unconfigured");
    expect(q('[role="status"]')?.textContent).toBe("Verification is not set up on this site, so this form cannot be sent.");
  });
});

describe("Human+", () => {
  it("exposes status as stable, read-only handles", async () => {
    installFakeApi("turnstile");
    await mount(<Captcha config={turnstile()} id="signup-captcha" />);
    await flush();
    const root = q("[data-fancy-captcha]")!;

    expect(root.id).toBe("signup-captcha");
    expect(root.getAttribute("data-fancy-captcha-provider")).toBe("turnstile");
    expect(root.getAttribute("data-fancy-captcha-mode")).toBe("widget");
    expect(root.getAttribute("data-fancy-captcha-status")).toBe("ready");
  });
});
