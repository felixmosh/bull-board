declare module '*.css' {
  const resource: Record<string, string>;
  export = resource;
}

declare module 'jsoneditor-react' {
  export const JsonEditor: (options: any) => JSX.Element;
}
