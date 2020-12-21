import { RequestHandler } from 'express-serve-static-core';
import { JobCleanStatus } from '../@types/app';
declare type RequestParams = {
    queueName: string;
    queueStatus: JobCleanStatus;
};
export declare const cleanAll: RequestHandler<RequestParams>;
export {};
