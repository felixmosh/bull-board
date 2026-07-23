import {
  AppJob,
  JobCleanStatus,
  JobFlow,
  JobRetryStatus,
  MetricsHistoryGranularity,
  RedisStats,
  Status,
} from '@bull-board/api/typings/app';
import {
  CleanJobResponse,
  GetJobResponse,
  GetMetricsHistoryResponse,
  GetMetricsHistoryUsageResponse,
  PurgeMetricsHistoryResponse,
  GetQueueDefaultJobOptionsResponse,
  GetQueueJobDataSchemaResponse,
  GetQueueMetricsResponse,
  GetQueuesResponse,
} from '@bull-board/api/typings/responses';
import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toastManager } from './toastManager';

/**
 * Error codes the UI resolves itself, with its own dialog or messaging, so the generic error
 * toast stays out of the way. Every other error still toasts.
 */
const CLIENT_HANDLED_ERROR_CODES = ['JOB_BELONGS_TO_JOB_SCHEDULER'];

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

  public cleanJob(queueName: string, jobId: AppJob['id']): Promise<CleanJobResponse> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/clean`
    );
  }

  public removeJobScheduler(queueName: string, schedulerId: string): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/job-schedulers/${encodeURIComponent(
        schedulerId
      )}/remove`
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

  public getJobFlow(queueName: string, jobId: AppJob['id']): Promise<JobFlow> {
    return this.axios.get(
      `/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(`${jobId}`)}/flow`
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

  public obliterateQueue(queueName: string) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/obliterate`);
  }

  public setGlobalConcurrency(queueName: string, concurrency: number) {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/concurrency`, { concurrency });
  }

  public getStats(): Promise<RedisStats> {
    return this.axios.get(`/redis/stats`);
  }

  public getMetrics(queueName: string): Promise<GetQueueMetricsResponse> {
    return this.axios.get(`/queues/${encodeURIComponent(queueName)}/metrics`);
  }

  public getHistoryMetrics(params: {
    queue?: string;
    from: number;
    to: number;
    granularity: MetricsHistoryGranularity;
  }): Promise<GetMetricsHistoryResponse> {
    return this.axios.get('/metrics/history', {
      params: {
        ...(params.queue ? { queue: params.queue } : {}),
        from: params.from,
        to: params.to,
        granularity: params.granularity,
      },
    });
  }

  public getHistoryUsage(): Promise<GetMetricsHistoryUsageResponse> {
    return this.axios.get('/metrics/history/usage');
  }

  public purgeHistory(options: {
    queue?: string;
    before?: string;
  }): Promise<PurgeMetricsHistoryResponse> {
    return this.axios.post('/metrics/history/purge', options);
  }

  public getQueueDefaultJobOptions(queueName: string): Promise<GetQueueDefaultJobOptionsResponse> {
    return this.axios.get(`/queues/${encodeURIComponent(queueName)}/default-job-options`);
  }

  public getQueueJobDataSchema(queueName: string): Promise<GetQueueJobDataSchemaResponse> {
    return this.axios.get(`/queues/${encodeURIComponent(queueName)}/job-data-schema`);
  }

  private handleResponse(response: AxiosResponse): any {
    return response.data;
  }

  private async handleError(error: { response: AxiosResponse }): Promise<any> {
    const { error: title, message, code } = error.response.data ?? {};

    // Only codes listed above are silenced, since the caller owns what the user sees for those.
    // Anything else still toasts, so a new coded error can never fail silently.
    if (title && !CLIENT_HANDLED_ERROR_CODES.includes(code)) {
      toastManager.add({ type: 'error', title, description: message });
    }

    return Promise.resolve(error.response.data);
  }
}
