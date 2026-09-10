import { createBullBoard } from '@bull-board/api';
import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type {
  BoardOptions,
  IServerAdapter,
  QueueAdapterOptions,
} from '@bull-board/api/typings/app';
import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';

export type BullBoardInstance = ReturnType<typeof createBullBoard>;

export type BullBoardModuleOptions = {
  route: string;
  adapter: { new (): BullBoardServerAdapter };
  boardOptions?: BoardOptions;
  middleware?: any;
  basePath?: string;
};

export type BullBoardModuleAsyncOptions = {
  useFactory: (...args: any[]) => BullBoardModuleOptions | Promise<BullBoardModuleOptions>;
  imports?: ModuleMetadata['imports'];
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
};

type BullBoardQueueCommonOptions = {
  adapter: { new (queue: any, options?: Partial<QueueAdapterOptions>): BaseAdapter };
  options?: Partial<QueueAdapterOptions>;
};

export type BullBoardQueueOptions = BullBoardQueueCommonOptions &
  (
    | {
        /**
         * The queue name to resolve from the Nest DI container (via `getQueueToken`).
         */
        name: string;
        queue?: undefined;
      }
    | {
        /**
         * A queue instance to register directly, bypassing the DI container lookup.
         *
         * Use this when the name-based lookup cannot disambiguate the queue — e.g. two
         * queues sharing the same name but using different prefixes, which `@nestjs/bullmq`
         * collapses onto a single DI token.
         */
        queue: unknown;
        name?: string;
      }
  );

//create our own types with the needed functions, so we don't need to include express/fastify libraries here.
export type BullBoardServerAdapter = IServerAdapter & { setBasePath(path: string): any };
export type BullBoardFastifyAdapter = BullBoardServerAdapter & { registerPlugin(): any };
export type BullBoardExpressAdapter = BullBoardServerAdapter & { getRouter(): any };
