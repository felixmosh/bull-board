import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'react-toastify';
import { SelectedStatuses } from '../../typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { AppJob } from '@bull-board/api/typings/app';

export class Api {
  private axios: AxiosInstance;

  constructor({ basePath }: { basePath: string } = { basePath: '' }) {
    this.axios = Axios.create({ baseURL: `${basePath}/api` });
    this.axios.interceptors.response.use(this.handleResponse, this.handleError);
  }

  public getQueues({
    status,
    page,
  }: {
    status: SelectedStatuses;
    page: string;
  }): Promise<GetQueuesResponse> {
    return this.axios.get(`/queues`, { params: { ...status, page } });
  }

  public retryAll(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/retry`);
  }

  public cleanAllDelayed(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/clean/delayed`);
  }

  public cleanAllFailed(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/clean/failed`);
  }

  public cleanAllCompleted(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/clean/completed`);
  }

  public cleanJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/${jobId}/clean`);
  }

  public retryJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/${jobId}/retry`);
  }

  public promoteJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/${jobId}/promote`);
  }

  public getJobLogs(queueName: string, jobId: AppJob['id']): Promise<string[]> {
    return this.axios.get(`/queues/${encodeURIComponent(queueName)}/${jobId}/logs`);
  }

  private handleResponse(response: AxiosResponse): any {
    return response.data;
  }

  private async handleError(error: { response: AxiosResponse }): Promise<any> {
    if (error.response.data?.error) {
      toast.error(error.response.data?.error, { autoClose: 5000 });
    }

    return Promise.resolve(error.response.data);
  }
}
