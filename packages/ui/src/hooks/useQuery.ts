import { useLocation } from 'react-router-dom';

export function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}
