import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPowEngine, workerSource } from "../src/pow";
import { serverAccepts } from "./helpers";

const engine = createPowEngine();
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("the proof-of-work engine", () => {
  it("computes SHA-256 test vectors (FIPS 180-2) and agrees with node:crypto", () => {
    expect(hex(engine.sha256(ascii("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(engine.sha256(ascii("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(engine.sha256(ascii("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    for (const length of [55, 56, 63, 64, 65, 119, 200]) {
      const message = "x".repeat(length);
      expect(hex(engine.sha256(ascii(message)))).toBe(createHash("sha256").update(message).digest("hex"));
    }
  });

  it("counts leading zero bits like the server", () => {
    expect(engine.leadingZeroBits(Uint8Array.from([0xff]))).toBe(0);
    expect(engine.leadingZeroBits(Uint8Array.from([0x01, 0xff]))).toBe(7);
    expect(engine.leadingZeroBits(Uint8Array.from([0x00, 0x80]))).toBe(8);
    expect(engine.leadingZeroBits(Uint8Array.from([0x00, 0x00, 0x0f]))).toBe(20);
  });

  it("finds a nonce the SERVER accepts", () => {
    const nonce = engine.search("AbCdEfGhIjKlMnOpQrStUv:", 12, 0, 1_000_000);

    expect(nonce).toBeGreaterThanOrEqual(0);
    expect(serverAccepts(`AbCdEfGhIjKlMnOpQrStUv:${nonce}`, 12)).toBe(true);
  });

  it("returns -1 when a batch holds no solution, so the caller can report progress and continue", () => {
    expect(engine.search("AbCdEfGhIjKlMnOpQrStUv:", 32, 0, 50)).toBe(-1);
  });

  it("is self-contained, so it can run from its own source in a Web Worker", () => {
    // Exactly what the worker does: rebuild the engine from its text, with no
    // access to this module's scope. A reference to anything outside the
    // function would throw here.
    const rebuilt = new Function(`return (${createPowEngine.toString()})();`)() as typeof engine;
    expect(hex(rebuilt.sha256(ascii("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    expect(workerSource()).toContain(createPowEngine.toString());
    expect(workerSource()).toContain("onmessage");
  });
});
