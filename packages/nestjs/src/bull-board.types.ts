import { createBullBoard } from "@bull-board/api";
import { BoardOptions, IServerAdapter, QueueAdapterOptions } from "@bull-board/api/dist/typings/app";
import { BaseAdapter } from "@bull-board/api/dist/src/queueAdapters/base";

export type BullBoardInstance = ReturnType<typeof createBullBoard>;

export type BullBoardModuleOptions = {
  route: string;
  adapter: { new(): BullBoardServerAdapter };
  boardOptions?: BoardOptions;
  middleware?: any
}

export type BullBoardQueueOptions = {
  name: string;
  adapter: { new(queue: any, options?: QueueAdapterOptions): BaseAdapter },
  options?: QueueAdapterOptions,
};

//create our own types with the needed functions, so we don't need to include express/fastify libraries here.
export type BullBoardServerAdapter = IServerAdapter & { setBasePath(path: string): any };
export type BullBoardFastifyAdapter = BullBoardServerAdapter & { registerPlugin(): any };
export type BullBoardExpressAdapter = BullBoardServerAdapter & { getRouter(): any };