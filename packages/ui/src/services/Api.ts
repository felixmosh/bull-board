import { AppJob, Status } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'react-toastify';

export class Api {
  private axios: AxiosInstance;

  constructor({ basePath }: { basePath: string } = { basePath: '' }) {
    this.axios = Axios.create({ baseURL: `${basePath}/api` });
    this.axios.interceptors.response.use(this.handleResponse, this.handleError);
  }

  public getQueues({
    activeQueue,
    status,
    page,
  }: {
    activeQueue?: string;
    status?: Status;
    page: string;
  }): Promise<GetQueuesResponse> {
    return this.axios.get(`/queues`, { params: { activeQueue, status, page } });
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
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/clean`
    );
  }

  public retryJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/retry`
    );
  }

  public promoteJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/promote`
    );
  }

  public getJobLogs(queueName: string, jobId: AppJob['id']): Promise<string[]> {
    return this.axios.get(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/logs`
    );
  }

  public pauseQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/pause`);
  }

  public resumeQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/resume`);
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
