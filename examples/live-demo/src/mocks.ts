import MockRedis from 'ioredis-mock/browser';
import fs from 'fs';
import path from 'path';

// recreate commands folder
const commandsDir = '/commands';
const files = (require as any).context('bullmq/dist/esm/commands/', true, /\.lua$/);

files.keys().forEach((file: string) => {
  const content = files(file);
  const dir = path.dirname(path.join(commandsDir, file));
  (fs as any).mkdirpSync(dir);
  fs.writeFileSync(path.join('/commands', file), content.default);
});

// MockRedis.prototype['bullmq:loadingCommands'] = {};
(window as any).mockIORedis = MockRedis;
window.require = {
  resolve() {
    return '';
  },
} as any;
