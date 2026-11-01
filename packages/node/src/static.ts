import { open, realpath } from 'fs/promises';
import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { pipeline } from 'stream/promises';
import mime from 'mime-types';

type StaticMount = { route: string; directory: string };

export async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  mountedPath: string,
  mount: StaticMount
): Promise<boolean> {
  const route = normalizeRoute(mount.route);
  if (mountedPath !== route && !mountedPath.startsWith(`${route}/`)) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const relative = mountedPath.slice(route.length).replace(/^\//, '');
  if (!relative) return notFound(response);
  if (relative.includes('\\') || /^[a-zA-Z]:/.test(relative) || relative.includes('\0'))
    return badRequest(response);
  let decoded: string;
  try {
    decoded = relative
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return badRequest(response);
  }
  if (decoded.includes('\\') || decoded.includes('\0') || /^[a-zA-Z]:/.test(decoded))
    return badRequest(response);
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return badRequest(response);

  try {
    const root = await realpath(mount.directory);
    const candidate = path.resolve(root, ...segments);
    if (!isContained(root, candidate)) return badRequest(response);
    const file = await realpath(candidate);
    if (!isContained(root, file)) return badRequest(response);
    const handle = await open(file, 'r');
    try {
      if (!(await handle.stat()).isFile()) return notFound(response);
      if (response.destroyed || response.writableEnded) return true;
      response.statusCode = 200;
      response.setHeader(
        'Content-Type',
        mime.contentType(path.extname(file)) || 'application/octet-stream'
      );
      if (request.method === 'HEAD') {
        response.end();
      } else {
        await pipeline(handle.createReadStream(), response);
      }
      return true;
    } finally {
      await handle.close();
    }
  } catch {
    if (response.headersSent) {
      response.destroy();
      return true;
    }
    if (!response.destroyed && !response.writableEnded) return notFound(response);
    return true;
  }
}

function normalizeRoute(route: string): string {
  const normalized = `/${route.split('/').filter(Boolean).join('/')}`;
  return normalized === '/' ? '' : normalized;
}

function isContained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function badRequest(response: ServerResponse): true {
  if (!response.destroyed && !response.writableEnded) {
    response.statusCode = 400;
    response.end();
  }
  return true;
}

function notFound(response: ServerResponse): true {
  if (!response.destroyed && !response.writableEnded) {
    response.statusCode = 404;
    response.end();
  }
  return true;
}
