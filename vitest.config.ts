import { defineConfig } from "vitest/config";

export default defineConfig({
  projects: [
    {
      extends: "./vitest.shared.ts",
      test: {
        include: ["packages/**/src/**/*.test.ts", "packages/**/src/**/*.spec.ts"],
      },
    },
  ],
});
