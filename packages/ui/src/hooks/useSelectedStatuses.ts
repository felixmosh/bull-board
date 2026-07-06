import { STATUSES } from '@bull-board/api/constants/statuses';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SelectedStatuses } from '../../typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { parseStatus } from './useSearchParams';

function getActiveStatus(search: string) {
  return parseStatus(new URLSearchParams(search).get('status')) ?? STATUSES.latest;
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
