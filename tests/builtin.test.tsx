import { afterEach, describe, expect, it, vi } from "vitest";
import { Captcha, CAPTCHA_FIELDS, captchaData } from "../src";
import { CHALLENGE_ID, cleanupDom, config, fakeForm, flush, input, mockChallengeFetch, mount, q, serverAccepts, until } from "./helpers";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanupDom();
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

describe("field names", () => {
  it("are the same constants as the server's FancyCaptcha\\Fields", () => {
    expect(CAPTCHA_FIELDS).toEqual({ honeypot: "contact_fax", started: "_captcha_started", pow: "_captcha_pow", token: "_captcha_token" });
  });

  it("give a form its initial data from the server's props", () => {
    expect(captchaData(config({ fields: { honeypot: "office_fax", started: "s", pow: "p", token: "t" } }))).toEqual({
      office_fax: "",
      s: config().started,
      p: "",
      t: "",
    });
  });
});

describe("the honeypot", () => {
  it("is hidden from people, assistive tech and the keyboard, and never autofilled", async () => {
    await mount(<Captcha config={config()} />);
    const field = input("contact_fax")!;
    const wrapper = q("[data-fancy-captcha-honeypot]")!;

    expect(field).not.toBeNull();
    expect(field.type).toBe("text");
    expect(field.tabIndex).toBe(-1);
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.hasAttribute("inert")).toBe(true);
    expect(wrapper.contains(field)).toBe(true);
    // Off-screen on the INLINE axis, so it mirrors under RTL instead of adding scroll.
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.insetInlineStart).toBe("-10000px");
    expect(wrapper.style.left).toBe("");
  });

  it("is labelled like a real field, because the label is what a bot reads", async () => {
    await mount(<Captcha config={config()} />);

    expect(q(`label[for="${input("contact_fax")!.id}"]`)?.textContent).toBe("Fax number");
  });

  it("writes what a bot types into the form, so the server sees it", async () => {
    const form = fakeForm(captchaData(config()));
    await mount(<Captcha config={config()} form={form} />);

    const field = input("contact_fax")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(field, "555-0100");
    field.dispatchEvent(new Event("input", { bubbles: true }));

    expect(form.data.contact_fax).toBe("555-0100");
  });
});

describe("the signed timestamp", () => {
  it("is posted as a hidden field", async () => {
    await mount(<Captcha config={config()} />);

    expect(input("_captcha_started")?.type).toBe("hidden");
    expect(input("_captcha_started")?.value).toBe(config().started);
  });

  it("is put into a form that was not seeded with it", async () => {
    const form = fakeForm({ email: "" });
    await mount(<Captcha config={config()} form={form} />);

    expect(form.data._captcha_started).toBe(config().started);
  });

  it("uses renamed fields from the server props", async () => {
    await mount(<Captcha config={config({ fields: { honeypot: "office_fax", started: "when", pow: "work", token: "tok" } })} />);

    expect(input("office_fax")).not.toBeNull();
    expect(input("when")?.value).toBe(config().started);
    expect(input("contact_fax")).toBeNull();
  });
});

describe("proof-of-work", () => {
  const powConfig = () => config({ pow: { enabled: true, difficulty: 8, challengeUrl: "/fancy-captcha/challenge" } });

  it("fetches a challenge, solves it, and posts a solution the server accepts", async () => {
    const calls = mockChallengeFetch();
    const form = fakeForm(captchaData(powConfig()));
    const statuses: string[] = [];
    await mount(<Captcha config={powConfig()} form={form} onStatusChange={(s) => statuses.push(s)} />);

    await until(() => form.data._captcha_pow !== "");

    expect(calls).toEqual(["/fancy-captcha/challenge"]);
    expect(form.data._captcha_pow.startsWith(`${CHALLENGE_ID}:`)).toBe(true);
    expect(serverAccepts(form.data._captcha_pow, 8)).toBe(true);
    expect(statuses).toContain("solving");
    expect(statuses.at(-1)).toBe("solved");
    expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("solved");
  });

  it("announces progress in a polite live region", async () => {
    mockChallengeFetch();
    await mount(<Captcha config={powConfig()} />);
    const region = q('[role="status"]')!;

    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    await until(() => input("_captcha_pow")?.value !== "");
    expect(region.textContent).toBe("Check complete.");
  });

  it("solves again when the form clears the solution (a challenge is single-use)", async () => {
    const calls = mockChallengeFetch([
      { id: CHALLENGE_ID, difficulty: 8, expiresIn: 300, algorithm: "sha256-leading-zero-bits" },
      { id: "ZyXwVuTsRqPoNmLkJiHgFe", difficulty: 8, expiresIn: 300, algorithm: "sha256-leading-zero-bits" },
    ]);
    const form = fakeForm(captchaData(powConfig()));
    const view = await mount(<Captcha config={powConfig()} form={form} />);
    await until(() => form.data._captcha_pow !== "");

    // After a successful submit, the host resets the form.
    form.setData("_captcha_pow", "");
    await view.rerender(<Captcha config={powConfig()} form={form} />);
    await until(() => form.data._captcha_pow.startsWith("ZyXwVuTsRqPoNmLkJiHgFe:"));

    expect(calls).toHaveLength(2);
    expect(serverAccepts(form.data._captcha_pow, 8)).toBe(true);
  });

  it("refuses a hostile challenge instead of searching forever", async (ctx) => {
    void ctx;
    for (const bad of [
      { id: CHALLENGE_ID, difficulty: 99 },
      { id: CHALLENGE_ID, difficulty: 0 },
      { id: "short", difficulty: 8 },
      { id: "x".repeat(10_000), difficulty: 8 },
      { id: CHALLENGE_ID, difficulty: "8" },
      ["not", "an", "object"],
    ]) {
      cleanupDom();
      mockChallengeFetch([bad]);
      const form = fakeForm(captchaData(powConfig()));
      const view = await mount(<Captcha config={powConfig()} form={form} />);
      await flush(10);

      expect(form.data._captcha_pow).toBe("");
      expect(q("[data-fancy-captcha]")?.getAttribute("data-fancy-captcha-status")).toBe("error");
      await view.unmount();
    }
  });

  it("stops working and writes nothing after unmount", async () => {
    mockChallengeFetch([{ id: CHALLENGE_ID, difficulty: 24, expiresIn: 300, algorithm: "sha256-leading-zero-bits" }]);
    const form = fakeForm(captchaData(powConfig()));
    const view = await mount(<Captcha config={powConfig()} form={form} />);
    await flush(3);
    await view.unmount();
    const writes = form.calls.length;

    await flush(20);

    expect(form.calls.length).toBe(writes);
    expect(form.data._captcha_pow).toBe("");
  });

  it("solves in a Web Worker when one is available, and terminates it on unmount", async () => {
    mockChallengeFetch();
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      posted: unknown[] = [];
      terminated = false;
      constructor(public url: string) {
        workers.push(this);
      }
      postMessage(message: unknown) {
        this.posted.push(message);
      }
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:fake-worker", revokeObjectURL: () => undefined }));
    const form = fakeForm(captchaData(powConfig()));
    const view = await mount(<Captcha config={powConfig()} form={form} />);
    await until(() => workers.length === 1 && workers[0]!.posted.length === 1);

    expect(workers[0]!.url).toBe("blob:fake-worker");
    expect(workers[0]!.posted[0]).toEqual({ prefix: `${CHALLENGE_ID}:`, difficulty: 8 });

    await import("react").then(({ act }) =>
      act(async () => {
        workers[0]!.onmessage?.({ data: { type: "progress", attempts: 128 } } as MessageEvent);
        workers[0]!.onmessage?.({ data: { type: "solved", nonce: 4242 } } as MessageEvent);
      }),
    );

    expect(form.data._captcha_pow).toBe(`${CHALLENGE_ID}:4242`);
    await view.unmount();
    expect(workers[0]!.terminated).toBe(true);
  });

  it("does nothing when proof-of-work is off", async () => {
    const calls = mockChallengeFetch();
    await mount(<Captcha config={config()} />);
    await flush(5);

    expect(calls).toEqual([]);
    expect(input("_captcha_pow")).toBeNull();
  });
});
