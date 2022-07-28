import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SelectedStatuses, Status } from '../../typings/app';
import { STATUS_LIST } from '../constants/status-list';
import { useActiveQueueName } from './useActiveQueueName';

function getActiveStatus(search: string) {
  const query = new URLSearchParams(search);
  return (query.get('status') as Status) || STATUS_LIST[0];
}

export function useSelectedStatuses(): SelectedStatuses {
  const { search } = useLocation();
  const activeQueueName = useActiveQueueName();

  const [selectedStatuses, setSelectedStatuses] = useState<SelectedStatuses>({
    [activeQueueName]: getActiveStatus(search),
  });

  useEffect(() => {
    const status = getActiveStatus(search);
    if (activeQueueName) {
      setSelectedStatuses({ ...selectedStatuses, [activeQueueName]: status });
    }
  }, [search, activeQueueName]);

  return selectedStatuses;
}
