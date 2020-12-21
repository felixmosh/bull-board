import { QueueAdapter } from './@types/app';
export { BullMQAdapter } from './queueAdapters/bullMQ';
export { BullAdapter } from './queueAdapters/bull';
declare const router: import("express-serve-static-core").Express;
export declare const setQueues: (bullQueues: ReadonlyArray<QueueAdapter>) => void;
export declare const replaceQueues: (bullQueues: ReadonlyArray<QueueAdapter>) => void;
export { router };
