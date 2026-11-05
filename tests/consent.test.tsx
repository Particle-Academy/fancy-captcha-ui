import { afterEach, describe, expect, it } from "vitest";
import { Captcha } from "../src";
import { cleanupDom, config, flush, input, mockChallengeFetch, mount, q } from "./helpers";
import { installFakeApi } from "./providers";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanupDom();
  globalThis.fetch = realFetch;
});

function scripts(): number {
  return document.head.querySelectorAll("script[data-fancy-captcha-script]").length;
}

/** Structurally what fancy-compliance-ui's useConsent() returns; only `allows` is read. */
function consent(granted: string[]) {
  return { allows: (category: string) => granted.includes(category) };
}

const gated = () =>
  config({
    provider: "turnstile",
    siteKey: "site-key-public",
    consentCategory: "functional",
    pow: { enabled: true, difficulty: 8, challengeUrl: "/fancy-captcha/challenge" },
  });

describe("consent gating", () => {
  it("never loads the provider before the category is granted, and falls back to the built-in check", async () => {
    mockChallengeFetch();
    await mount(<Captcha config={gated()} consent={consent([])} />);
    await flush();

    expect(scripts()).toBe(0);
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-mode")).toBe("builtin");
    expect(input("_captcha_pow")).not.toBeNull();
    expect(input("contact_fax")).not.toBeNull();
  });

  it("treats a gated provider as not granted when no consent API is given", async () => {
    mockChallengeFetch();
    await mount(<Captcha config={gated()} />);
    await flush();

    expect(scripts()).toBe(0);
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-mode")).toBe("builtin");
  });

  it("does not reuse a provider API already on the page before consent", async () => {
    mockChallengeFetch();
    const api = installFakeApi("turnstile");
    await mount(<Captcha config={gated()} consent={consent(["analytics"])} />);
    await flush();

    expect(api.widgets).toEqual([]);
  });

  it("switches to the provider once the person grants the category", async () => {
    mockChallengeFetch();
    const view = await mount(<Captcha config={gated()} consent={consent([])} />);
    await flush();
    expect(scripts()).toBe(0);

    await view.rerender(<Captcha config={gated()} consent={consent(["functional"])} />);
    await flush();

    expect(scripts()).toBe(1);
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-mode")).toBe("widget");
    expect(input("_captcha_pow")).toBeNull();
  });

  it("returns to the built-in check when consent is withdrawn", async () => {
    mockChallengeFetch();
    const api = installFakeApi("turnstile");
    const view = await mount(<Captcha config={gated()} consent={consent(["functional"])} />);
    await flush();
    expect(api.widgets).toHaveLength(1);

    await view.rerender(<Captcha config={gated()} consent={consent([])} />);
    await flush();

    expect(api.removes).toEqual(["widget-0"]);
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-mode")).toBe("builtin");
  });

  it("takes the category from a prop when the server does not name one", async () => {
    mockChallengeFetch();
    await mount(
      <Captcha config={config({ provider: "turnstile", siteKey: "k", pow: gated().pow })} consentCategory="functional" consent={consent([])} />,
    );
    await flush();

    expect(scripts()).toBe(0);
  });

  it("asks nothing when the provider is not gated", async () => {
    let asked = 0;
    await mount(<Captcha config={config({ provider: "turnstile", siteKey: "k" })} consent={{ allows: () => (asked++, false) }} />);
    await flush();

    expect(asked).toBe(0);
    expect(scripts()).toBe(1);
  });
});
