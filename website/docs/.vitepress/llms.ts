import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import type { SiteConfig } from 'vitepress';

interface SidebarItem {
  text?: string;
  link?: string;
  items?: SidebarItem[];
}

const SITE_TITLE = 'bull-board';
const SITE_URL = 'https://felixmosh.github.io/bull-board';
const SITE_DESCRIPTION = 'Dashboard for Bull and BullMQ job queues.';

function flatten(items: SidebarItem[]): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const item of items) {
    if (item.link) out.push(item);
    if (item.items) out.push(...flatten(item.items));
  }
  return out;
}

function stripFrontmatter(md: string): string {
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\s+/, '');
  }
  return md;
}

function linkToFile(srcDir: string, link: string): string {
  const clean = link.endsWith('/') ? `${link}index` : link;
  return join(srcDir, `${clean}.md`);
}

function copyRawSource(srcDir: string, outDir: string, link: string): void {
  const cleanLink = link.endsWith('/') ? `${link}index` : link;
  const srcFile = join(srcDir, `${cleanLink}.md`);
  const destFile = resolve(outDir, `${cleanLink.replace(/^\//, '')}.md`);
  mkdirSync(dirname(destFile), { recursive: true });
  copyFileSync(srcFile, destFile);
}

export function generateLlmsTxt(siteConfig: SiteConfig): void {
  const { site, srcDir, outDir } = siteConfig;
  const sidebar = site.themeConfig.sidebar as SidebarItem[] | Record<string, SidebarItem[]>;
  const sidebarArray = Array.isArray(sidebar) ? sidebar : Object.values(sidebar).flat();
  const flat = flatten(sidebarArray);

  const indexLines: string[] = [
    `# ${SITE_TITLE}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    '## Docs',
    '',
  ];
  const fullParts: string[] = [
    `# ${SITE_TITLE}\n\n> ${SITE_DESCRIPTION}\n`,
  ];

  for (const item of flat) {
    if (!item.link) continue;
    const filePath = linkToFile(srcDir, item.link);
    let body: string;
    try {
      body = readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`llms.txt: failed to read source file ${filePath} for sidebar link ${item.link}: ${(err as Error).message}`);
    }
    copyRawSource(srcDir, outDir, item.link);
    const title = item.text ?? item.link;
    const cleanLink = item.link.endsWith('/') ? `${item.link}index` : item.link;
    const url = `${SITE_URL}${cleanLink}.md`;

    indexLines.push(`- [${title}](${url})`);
    fullParts.push(`\n\n<!-- source: ${cleanLink}.md -->\n`);
    fullParts.push(stripFrontmatter(body));
  }

  const llmsTxt = indexLines.join('\n') + '\n';
  const llmsFullTxt = fullParts.join('');

  writeFileSync(resolve(outDir, 'llms.txt'), llmsTxt);
  writeFileSync(resolve(outDir, 'llms-full.txt'), llmsFullTxt);
}
