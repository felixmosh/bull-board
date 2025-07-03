import { UIConfig } from '@bull-board/api/typings/app';
import React, { useContext, useEffect } from 'react';

export const UIConfigContext = React.createContext<UIConfig>(null as any);

export function useUIConfig() {
  const uiConfig = useContext(UIConfigContext);

  useEffect(() => {
    if (uiConfig?.menu?.width) {
      document.documentElement.style.setProperty('--menu-width', uiConfig.menu.width);
    }
  }, [uiConfig?.menu?.width]);

  return uiConfig;
}
