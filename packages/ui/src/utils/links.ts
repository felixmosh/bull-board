import { SelectedStatuses } from '../../typings/app';

export const links = {
  queuePage(
    queueName: string,
    selectedStatuses: SelectedStatuses = {}
  ): { pathname: string; search: string } {
    const { pathname, searchParams } = new URL(
      `/queue/${encodeURIComponent(queueName)}`,
      'http://fake.com'
    );

    const withStatus = selectedStatuses[queueName] && selectedStatuses[queueName] !== 'latest';
    if (withStatus) {
      searchParams.set('status', selectedStatuses[queueName]);
    }

    return {
      pathname,
      search: searchParams.toString(),
    };
  },
  jobPage(
    queueName: string,
    jobId: string,
    selectedStatuses: SelectedStatuses = {}
  ): { pathname: string; search: string } {
    const { pathname: queuePath, search } = links.queuePage(queueName, selectedStatuses);
    const { pathname } = new URL(`${queuePath}/${encodeURIComponent(jobId)}`, 'http://fake.com');
    return {
      pathname,
      search,
    };
  },
};
