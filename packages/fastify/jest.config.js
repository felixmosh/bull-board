const pkg = require("./package.json");
const { defaults: tsJest } = require("ts-jest/presets");
module.exports = {
  displayName: pkg.name,
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    ...tsJest.transform,
    // content-disposition@3, required by @fastify/static >= 10.1.4, is ESM only.
    "/node_modules/content-disposition/.+\\.js$": [
      "ts-jest",
      { tsconfig: { allowJs: true, module: "commonjs" } },
    ],
  },
  transformIgnorePatterns: ["^(?!.*/node_modules/content-disposition/).*/node_modules/"],
  testMatch: ["<rootDir>/tests/**/*.spec.ts"],
  testTimeout: 30000,
};
