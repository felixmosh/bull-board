const pkg = require("./package.json");
module.exports = {
  displayName: pkg.name,
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { types: ["node", "jest"] } }],
  },
  testMatch: ["<rootDir>/tests/**/*.spec.ts"],
  testTimeout: 30000,
};
