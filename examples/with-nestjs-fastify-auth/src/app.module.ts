import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LocalStrategy } from './bullboard-auth.local.strategy';
import { QueueModule } from './queues/queue.module';

@Module({
  imports: [PassportModule.register({ session: true }), QueueModule.register()],
  controllers: [AppController],
  providers: [AppService, LocalStrategy],
})
export class AppModule {}
