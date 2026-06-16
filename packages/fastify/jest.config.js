const pkg = require("./package.json");
const { defaults: tsJest } = require("ts-jest/presets");
module.exports = {
  displayName: pkg.name,
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    ...tsJest.transform,
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  testMatch: ["<rootDir>/tests/**/*.spec.ts"],
  testTimeout: 30000,
  moduleNameMapper: {
    "^fastify$": "fastify-v5",
    "^fastify/(.*)$": "fastify-v5/$1",
  },
};
