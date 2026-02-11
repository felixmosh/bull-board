import { createBullBoard } from '@sinianluoye/bull-board-api';
import type {
  BoardOptions,
  IServerAdapter,
  QueueAdapterOptions,
} from '@sinianluoye/bull-board-api/typings/app';
import type { BaseAdapter } from '@sinianluoye/bull-board-api/baseAdapter';
import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';

export type BullBoardInstance = ReturnType<typeof createBullBoard>;

export type BullBoardModuleOptions = {
  route: string;
  adapter: { new (): BullBoardServerAdapter };
  boardOptions?: BoardOptions;
  middleware?: any;
};

export type BullBoardModuleAsyncOptions = {
  useFactory: (...args: any[]) => BullBoardModuleOptions | Promise<BullBoardModuleOptions>;
  imports?: ModuleMetadata['imports'];
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
};

export type BullBoardQueueOptions = {
  name: string;
  adapter: { new (queue: any, options?: Partial<QueueAdapterOptions>): BaseAdapter };
  options?: Partial<QueueAdapterOptions>;
};

//create our own types with the needed functions, so we don't need to include express/fastify libraries here.
export type BullBoardServerAdapter = IServerAdapter & { setBasePath(path: string): any };
export type BullBoardFastifyAdapter = BullBoardServerAdapter & { registerPlugin(): any };
export type BullBoardExpressAdapter = BullBoardServerAdapter & { getRouter(): any };
