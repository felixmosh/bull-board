import { entryPoint } from '@bull-board/api/dist/handlers/entryPoint';

describe('entryPoint handler', () => {
  const baseUiConfig = { boardTitle: 'My Board' } as any;

  it('renders the index view', () => {
    const result = entryPoint({ basePath: '/ui', uiConfig: baseUiConfig });
    expect(result.name).toBe('index.ejs');
  });

  it('appends a trailing slash to a basePath that lacks one', () => {
    const result = entryPoint({ basePath: '/ui', uiConfig: baseUiConfig });
    expect(result.params.basePath).toBe('/ui/');
  });

  it('leaves an already-trailing-slash basePath unchanged', () => {
    const result = entryPoint({ basePath: '/ui/', uiConfig: baseUiConfig });
    expect(result.params.basePath).toBe('/ui/');
  });

  it('escapes angle brackets in the serialized uiConfig', () => {
    const result = entryPoint({
      basePath: '',
      uiConfig: { boardTitle: '<script>alert(1)</script>' } as any,
    });
    expect(result.params.uiConfig).not.toContain('<');
    expect(result.params.uiConfig).not.toContain('>');
    expect(result.params.uiConfig).toContain('\\u003c');
  });

  it('passes the board title through', () => {
    const result = entryPoint({ basePath: '/', uiConfig: baseUiConfig });
    expect(result.params.title).toBe('My Board');
  });

  it('extracts favicon variants when present', () => {
    const result = entryPoint({
      basePath: '/',
      uiConfig: {
        boardTitle: 'B',
        favIcon: { default: '/d.png', alternative: '/a.png' },
      } as any,
    });
    expect(result.params.favIconDefault).toBe('/d.png');
    expect(result.params.favIconAlternative).toBe('/a.png');
  });

  it('tolerates a missing favIcon', () => {
    const result = entryPoint({ basePath: '/', uiConfig: baseUiConfig });
    expect(result.params.favIconDefault).toBeUndefined();
    expect(result.params.favIconAlternative).toBeUndefined();
  });
});
