import Axios, { AxiosInstance, AxiosResponse } from 'axios'
import { GetQueues } from '../../@types/api'
import { SelectedStatuses } from '../../@types/app'
import { toast } from 'react-toastify'

export class Api {
  private axios: AxiosInstance

  constructor({ basePath }: { basePath: string } = { basePath: '' }) {
    this.axios = Axios.create({ baseURL: `${basePath}/api` })
    this.axios.interceptors.response.use(this.handleResponse, this.handleError)
  }

  public getQueues({
    status,
  }: {
    status: SelectedStatuses
  }): Promise<GetQueues> {
    return this.axios.get(`/queues/`, { params: { ...status } })
  }

  public retryAll(queueName: string): Promise<void> {
    return this.axios.put(`/queues/${encodeURIComponent(queueName)}/retry`)
  }

  public cleanAllDelayed(queueName: string): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/clean/delayed`,
    )
  }

  public cleanAllFailed(queueName: string): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/clean/failed`,
    )
  }

  public cleanAllCompleted(queueName: string): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/clean/completed`,
    )
  }

  public cleanJob(
    queueName: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${jobId}/clean`,
    )
  }

  public retryJob(
    queueName: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${jobId}/retry`,
    )
  }

  public promoteJob(
    queueName: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    return this.axios.put(
      `/queues/${encodeURIComponent(queueName)}/${jobId}/promote`,
    )
  }

  private handleResponse(response: AxiosResponse): any {
    return response.data
  }

  private async handleError(error: { response: AxiosResponse }): Promise<any> {
    if (error.response.data?.error) {
      toast.error(error.response.data?.error, { autoClose: 5000 })
    }

    return Promise.resolve(error.response.data)
  }
}
