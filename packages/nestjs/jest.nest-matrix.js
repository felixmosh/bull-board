const fs = require('fs');
const path = require('path');

const NEST_PACKAGES = ['bull-shared', 'bullmq', 'common', 'core', 'platform-express'];

const resolvedMajor = (alias) => {
  let dir = path.dirname(require.resolve(alias));

  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json above the entry point of ${alias}`);
    dir = parent;
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return Number(version.split('.')[0]);
};

module.exports = function nestModuleNameMapper(major) {
  const mapper = {};

  for (const name of NEST_PACKAGES) {
    const alias = `nestjs-${name}-v${major}`;
    const actual = resolvedMajor(alias);

    if (actual !== major) {
      throw new Error(
        `${alias} resolves to @nestjs/${name}@${actual}.x, expected ${major}.x -- the alias range in package.json has drifted away from the major this project claims to test.`
      );
    }

    mapper[`^@nestjs/${name}$`] = alias;
    mapper[`^@nestjs/${name}/(.*)$`] = `${alias}/$1`;
  }

  return mapper;
};
