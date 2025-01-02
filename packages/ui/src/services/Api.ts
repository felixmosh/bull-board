import {
  AppJob,
  JobCleanStatus,
  JobRetryStatus,
  RedisStats,
  Status,
} from '@bull-board/api/typings/app';
import { GetJobResponse, GetQueuesResponse } from '@bull-board/api/typings/responses';
import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'react-toastify';

export class Api {
  private axios: AxiosInstance;

  constructor({ basePath }: { basePath: string } = { basePath: '' }) {
    this.axios = Axios.create({ baseURL: `${basePath}api` });
    this.axios.interceptors.response.use(this.handleResponse, this.handleError);
  }

  public getQueues({
    activeQueue,
    status,
    page,
    jobsPerPage,
  }: {
    activeQueue?: string;
    status?: Status;
    page: string;
    jobsPerPage: number;
  }): Promise<GetQueuesResponse> {
    return this.axios.get(`/queues`, { params: { activeQueue, status, page, jobsPerPage } });
  }

  public retryAll(queueName: string, status: JobRetryStatus): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/retry/${encodeURIComponent(status)}`
    );
  }

  public promoteAll(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/promote`);
  }

  public cleanAll(queueName: string, status: JobCleanStatus): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/clean/${encodeURIComponent(status)}`
    );
  }

  public cleanJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/clean`
    );
  }

  public retryJob(queueName: string, jobId: AppJob['id'], status: JobRetryStatus): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(
        `${jobId}`
      )}/retry/${encodeURIComponent(status)}`
    );
  }

  public promoteJob(queueName: string, jobId: AppJob['id']): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/promote`
    );
  }

  public updateJobData(
    queueName: string,
    jobId: AppJob['id'],
    newData: Record<string, any>
  ): Promise<void> {
    return this.axios.patch(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/update-data`,
      newData
    );
  }

  public getJobLogs(queueName: string, jobId: AppJob['id']): Promise<string[]> {
    return this.axios.get(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/logs`
    );
  }

  public getJob(queueName: string, jobId: AppJob['id']): Promise<GetJobResponse> {
    return this.axios.get(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}`
    );
  }

  public addJob(
    queueName: string,
    jobName: string,
    jobData: Record<any, any>,
    jobOptions: Record<any, any>
  ): Promise<GetJobResponse> {
    return this.axios.post(`/queues/${encodeURIComponent(queueName)}/add`, {
      name: jobName,
      data: jobData,
      options: jobOptions,
    });
  }

  public pauseQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/pause`);
  }

  public resumeQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/resume`);
  }

  public pauseAllQueues() {
    return this.axios.put(`/queues/pause`);
  }

  public resumeAllQueues() {
    return this.axios.put(`/queues/resume`);
  }

  public emptyQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/empty`);
  }

  public getStats(): Promise<RedisStats> {
    return this.axios.get(`/redis/stats`);
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
