import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Every one of these is a peer. Bundling react-fancy would ship a second
  // component registry (and a second Modal focus stack) into the consumer.
  external: ["react", "react-dom", "react/jsx-runtime", /^@particle-academy\/react-fancy/],
  treeshake: true,
});
