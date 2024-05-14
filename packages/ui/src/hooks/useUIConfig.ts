import { UIConfig } from '@wirdo-bullboard/api/typings/app';
import React, { useContext } from 'react';

export const UIConfigContext = React.createContext<UIConfig>(null as any);

export function useUIConfig() {
  return useContext(UIConfigContext);
}
