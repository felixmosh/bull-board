import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { NodeAdapter as BullBoardNodeAdapter } from '@bull-board/node';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { boardMiddleware } from './board.middleware.js';
const redisConnection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
};
@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection }),
    BullModule.registerQueue({ name: 'native-example' }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: BullBoardNodeAdapter,
      middleware: boardMiddleware,
    }),
    BullBoardModule.forFeature({ name: 'native-example', adapter: BullMQAdapter }),
  ],
})
export class AppModule {}
