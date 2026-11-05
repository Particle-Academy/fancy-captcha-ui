import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vitest runs from the package root; under jsdom import.meta.url is not a file URL.
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("package.json", () => {
  it("peers react-fancy 6.11 or later within 6.x, and React 19", () => {
    expect(pkg.peerDependencies).toEqual({
      "@particle-academy/react-fancy": ">=6.11.0 <7.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    });
  });

  it("has no runtime dependencies of its own", () => {
    expect(pkg.dependencies).toBeUndefined();
  });

  it("ships the changelog and readme", () => {
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
  });
});

describe("soft integrations", () => {
  it("imports neither fancy-compliance-ui nor Inertia: both are structural, so neither is required", () => {
    for (const file of sources(join(root, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["']@particle-academy\/fancy-compliance-ui/);
      expect(text, file).not.toMatch(/from\s+["']@inertiajs\//);
      expect(text, file).not.toMatch(/from\s+["']@particle-academy\/fancy-inertia/);
    }
    expect(JSON.stringify(pkg)).not.toContain("fancy-compliance-ui");
  });
});
