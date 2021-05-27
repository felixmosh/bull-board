import { useEffect, useState } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { SelectedStatuses } from '../../@types/app';
import { Status, STATUS_LIST } from '../components/constants';

export function useSelectedStatuses(): SelectedStatuses {
  const { search, pathname } = useLocation();
  const match = useRouteMatch<{ name: string }>({ path: '/queue/:name' });

  const [selectedStatuses, setSelectedStatuses] = useState<SelectedStatuses>({});

  useEffect(() => {
    const query = new URLSearchParams(search);
    const status = (query.get('status') as Status) || STATUS_LIST[0];
    const queue = match ? decodeURIComponent(match?.params.name) : '';
    if (queue) {
      setSelectedStatuses({ ...selectedStatuses, [queue]: status });
    }
  }, [search, pathname]);

  return selectedStatuses;
}
