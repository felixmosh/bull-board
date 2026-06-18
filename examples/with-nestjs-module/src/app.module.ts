import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FeatureModule } from './feature/feature.module';

@Module({
  imports: [
    // infrastructure from here
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
        username: 'default',
        password: 'eYVX7EwVmmxKPCDmwMtyKVge8oLd2t81', //defined in the docker compose yml
      },
    }),

    //register the bull-board module forRoot in your app.module
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),

    //feature modules from here.
    FeatureModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
