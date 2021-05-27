export function toHapiPath(path: string) {
  return path
    .split('/')
    .map((path) => (path.startsWith(':') ? `{${path.substring(1)}}` : path))
    .join('/');
}
