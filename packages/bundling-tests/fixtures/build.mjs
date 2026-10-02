import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [bundler, format, entry, outfile] = process.argv.slice(2);

const builders = {
  async rolldown() {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({ input: entry, platform: 'node', logLevel: 'silent' });
    await bundle.write({ format, file: outfile });
    await bundle.close();
  },

  async esbuild() {
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format,
      outfile,
      logLevel: 'silent',
      banner:
        format === 'esm'
          ? { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }
          : undefined,
    });
  },

  async webpack() {
    const { default: webpack } = await import('webpack');
    const esm = format === 'esm';
    const stats = await new Promise((resolve, reject) =>
      webpack(
        {
          mode: 'production',
          target: 'node',
          entry: path.resolve(entry),
          output: {
            path: path.dirname(path.resolve(outfile)),
            filename: path.basename(outfile),
            module: esm,
            chunkFormat: esm ? 'module' : 'commonjs',
          },
          experiments: { outputModule: esm },
          optimization: { minimize: false },
        },
        (error, result) => (error ? reject(error) : resolve(result))
      )
    );
    if (stats.hasErrors()) {
      throw new Error(stats.toString('errors-only'));
    }
  },

  async rollup() {
    const { rollup } = await import('rollup');
    const { default: commonjs } = await import('@rollup/plugin-commonjs');
    const { default: json } = await import('@rollup/plugin-json');
    const { nodeResolve } = await import('@rollup/plugin-node-resolve');
    const bundle = await rollup({
      input: entry,
      onwarn: () => {},
      plugins: [
        nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
        commonjs({ ignoreDynamicRequires: true }),
        json(),
      ],
    });
    await bundle.write({ format: format === 'esm' ? 'es' : 'cjs', file: outfile, inlineDynamicImports: true });
    await bundle.close();
  },

  async bun() {
    try {
      execFileSync('bun', ['build', entry, '--target', 'node', '--format', format, '--outfile', outfile], {
        stdio: 'pipe',
      });
    } catch (error) {
      const details = error.stderr?.toString().trim();
      throw new Error(
        `bun build failed for ${entry}:\n${details || error.message}\n\n` +
          'If this reports "File not found" for a path under node_modules, the install tree is corrupt. ' +
          'Run: rm -rf node_modules packages/*/node_modules && yarn install'
      );
    }
  },
};

await builders[bundler]();
