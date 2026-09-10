// A wrong re-export path in `typings/*` resolves to `any` rather than failing, so it needs a gate.
import type { AppJob, AppQueue, ErrorResponseBody } from '@bull-board/api/typings/app';
import type { AddJobBody, GetQueuesQuery } from '@bull-board/api/typings/requests';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';

type IsAny<T> = 0 extends 1 & T ? true : false;

export const appJobIsTyped: false = null as unknown as IsAny<AppJob>;
export const appQueueIsTyped: false = null as unknown as IsAny<AppQueue>;
export const errorBodyIsTyped: false = null as unknown as IsAny<ErrorResponseBody>;
export const addJobBodyIsTyped: false = null as unknown as IsAny<AddJobBody>;
export const getQueuesQueryIsTyped: false = null as unknown as IsAny<GetQueuesQuery>;
export const getQueuesResponseIsTyped: false = null as unknown as IsAny<GetQueuesResponse>;

export const queueName: string = null as unknown as AppQueue['name'];
export const jobsPerPage: number = null as unknown as GetQueuesQuery['jobsPerPage'];
export const queues: AppJob[] = null as unknown as GetQueuesResponse['queues'][number]['jobs'];
