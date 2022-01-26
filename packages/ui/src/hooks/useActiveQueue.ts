import { matchPath } from 'react-router';
import { useLocation } from 'react-router-dom';

export function useActiveQueue(): string | undefined {
  const { pathname } = useLocation();
  const match = matchPath<{ name: string }>(pathname, {
    path: '/queue/:name',
    exact: true,
    strict: true,
  });

  return match?.params.name;
}
