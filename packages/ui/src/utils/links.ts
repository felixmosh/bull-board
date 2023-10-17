import { SelectedStatuses } from '../../typings/app';

export const links = {
  queuePage(queueName: string, selectedStatuses: SelectedStatuses = {}): string {
    const withoutStatus =
      !selectedStatuses[queueName] || selectedStatuses[queueName] === 'latest';
    return `/queue/${encodeURIComponent(queueName)}${
      withoutStatus ? '' : `?status=${selectedStatuses[queueName]}`
    }`;
  },
  jobPage(queueName: string, jobId: string, selectedStatuses: SelectedStatuses = {}): string {
    const [queuePage, search] = links.queuePage(queueName, selectedStatuses).split('?');
    return [`${queuePage}/${encodeURIComponent(jobId)}`, search].filter(Boolean).join('?');
  },
};
