const { devDependencies, peerDependencies } = require('./package.json');
const base = require('./jest.base.js');

const pinned = devDependencies['bullmq-v5-floor'].replace('npm:bullmq@', '');
const declared = peerDependencies.bullmq.split('||')[0].trim().replace(/^\^/, '');

if (pinned !== declared) {
  throw new Error(
    `bullmq-v5-floor is pinned to ${pinned} but the bullmq peer range starts at ${declared}. ` +
      `Pin the alias to the declared floor, or this project tests a version nobody claims to support.`
  );
}

module.exports = {
  ...base,
  displayName: `bullmq@${pinned} (peer floor)`,
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testPathIgnorePatterns: [...base.testPathIgnorePatterns, '<rootDir>/tests/bullmq-matrix/'],
  moduleNameMapper: { '^bullmq$': 'bullmq-v5-floor', '^bullmq/(.*)$': 'bullmq-v5-floor/$1' },
};
