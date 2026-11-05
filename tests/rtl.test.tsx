import { afterEach, describe, expect, it } from "vitest";
import { Captcha, useCaptcha } from "../src";
import { cleanupDom, config, flush, mockChallengeFetch, mount, q } from "./helpers";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanupDom();
  globalThis.fetch = realFetch;
});

describe("direction and messages", () => {
  it("sets dir on its root when given one", async () => {
    await mount(<Captcha config={config()} dir="rtl" />);

    expect(q("[data-fancy-captcha]")?.getAttribute("dir")).toBe("rtl");
  });

  it("inherits direction when not given one", async () => {
    await mount(<Captcha config={config()} />);

    expect(q("[data-fancy-captcha]")?.hasAttribute("dir")).toBe(false);
  });

  it("translates every visible string, falling back to English", async () => {
    mockChallengeFetch();
    await mount(
      <Captcha
        config={config({ pow: { enabled: true, difficulty: 8, challengeUrl: "/c" } })}
        messages={{ "fancy-captcha.pow.done": "Comprobación completa.", "fancy-captcha.honeypot.label": "Número de fax" }}
      />,
    );
    await flush(30);

    expect(q('[role="status"]')?.textContent).toBe("Comprobación completa.");
    expect(q("[data-fancy-captcha-honeypot] label")?.textContent).toBe("Número de fax");
  });
});

describe("useCaptcha (headless)", () => {
  it("gives the state and the field values without rendering anything", async () => {
    let seen: ReturnType<typeof useCaptcha> | null = null;
    function Probe() {
      seen = useCaptcha({ config: config() });

      return null;
    }
    await mount(<Probe />);

    expect(seen!.mode).toBe("builtin");
    expect(seen!.values).toEqual({ contact_fax: "", _captcha_started: config().started });
    expect(typeof seen!.reset).toBe("function");
    expect(typeof seen!.cancel).toBe("function");
  });
});
