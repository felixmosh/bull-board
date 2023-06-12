import { Inject, Module, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { getQueueToken } from "@nestjs/bull-shared";
import { BullBoardInstance, BullBoardQueueOptions } from "./bull-board.types";
import { Queue } from "bullmq";
import { BULL_BOARD_INSTANCE, BULL_BOARD_QUEUES } from "./bull-board.constants";

@Module({})
export class BullBoardFeatureModule implements OnModuleInit {

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(BULL_BOARD_QUEUES) private readonly queues: BullBoardQueueOptions[],
    @Inject(BULL_BOARD_INSTANCE) private readonly board: BullBoardInstance
  ) {
  }

  onModuleInit(): any {
    for (const queueOption of this.queues) {
      const queue = this.moduleRef.get<Queue>(getQueueToken(queueOption.name), {strict: false});
      const queueAdapter = new queueOption.adapter(queue, queueOption.options);
      this.board.addQueue(queueAdapter);
    }
  }
}