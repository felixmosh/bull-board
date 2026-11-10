import type { UIConfig, ThemedBoardLogo } from '@bull-board/api/typings/app';

function normalizeConfig(uiConfig: UIConfig) {
  if (uiConfig.boardLogo) {
    if (!('light' in uiConfig.boardLogo)) {
      (uiConfig.boardLogo as unknown as ThemedBoardLogo).light = {
        path: uiConfig.boardLogo.path,
        width: uiConfig.boardLogo.width,
        height: uiConfig.boardLogo.height,
      };
    }
  }
}

export function getUIConfig(): UIConfig {
  const uiConfig = JSON.parse(
    document.getElementById('__UI_CONFIG__')?.textContent || '{}'
  ) as UIConfig;

  normalizeConfig(uiConfig);

  return uiConfig;
}
