import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from './queues/queue.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './bullboard-auth.local.strategy';

@Module({
  imports: [PassportModule.register({ session: true }), QueueModule.register()],
  controllers: [AppController],
  providers: [AppService, LocalStrategy],
})
export class AppModule {}
