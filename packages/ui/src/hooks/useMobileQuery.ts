import { useMediaQuery } from './useMediaQuery';

export function useMobileQuery() {
  return useMediaQuery('(max-width: 768px)');
}
