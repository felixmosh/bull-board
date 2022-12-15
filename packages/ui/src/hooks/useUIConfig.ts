import { UIConfig } from '@bull-board/api/dist/typings/app';
import React, { useContext } from 'react';

export const UIConfigContext = React.createContext<UIConfig>(null as any);

export function useUIConfig() {
  return useContext(UIConfigContext);
}
