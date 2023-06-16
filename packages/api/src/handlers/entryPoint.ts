import { UIConfig, ViewHandlerReturnType } from '../../typings/app';

export function entryPoint(params: {
  basePath: string;
  uiConfig: UIConfig;
}): ViewHandlerReturnType {
  const basePath = params.basePath.endsWith('/') ? params.basePath : `${params.basePath}/`;
  const uiConfig = JSON.stringify(params.uiConfig)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return {
    name: 'index.ejs',
    params: { basePath, uiConfig, title: params.uiConfig.boardTitle as string },
  };
}
