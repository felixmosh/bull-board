import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { InjectTestQueue } from './queues/test.processor';

@Injectable()
export class AppService {
  constructor(@InjectTestQueue() readonly testQueue: Queue) {}

  addToQueue(fail: boolean) {
    this.testQueue.add('123', { fail });
    return 'OK';
  }
}
