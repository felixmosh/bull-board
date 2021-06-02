export function getStaticPath(path: string): string {
  return `${(window as any).__basePath__}/static${path}`;
}
