import fs from 'fs';
import path from 'path';
import { buildSpec, readOverview } from './buildSpec';
import { renderMarkdown } from './renderMarkdown';

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');

export const SPEC_PATH = path.join(REPO_ROOT, 'website/docs/public/openapi.json');
export const MARKDOWN_PATH = path.join(REPO_ROOT, 'website/docs/reference/http-api.md');
export const INTRO_PATH = path.join(PACKAGE_ROOT, 'scripts/openapi/http-api.intro.md');

export function renderArtifacts(): { spec: string; markdown: string } {
  const spec = buildSpec();
  const intro = `${fs.readFileSync(INTRO_PATH, 'utf8').trimEnd()}\n\n${readOverview()}`;

  return {
    spec: `${JSON.stringify(spec, null, 2)}\n`,
    markdown: renderMarkdown(spec, intro),
  };
}

export function writeArtifacts(): void {
  const { spec, markdown } = renderArtifacts();

  fs.mkdirSync(path.dirname(MARKDOWN_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(SPEC_PATH), { recursive: true });
  fs.writeFileSync(SPEC_PATH, spec);
  fs.writeFileSync(MARKDOWN_PATH, markdown);
}
