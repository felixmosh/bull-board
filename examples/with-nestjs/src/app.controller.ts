import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  addToQueue(@Query('fail') fail: string) {
    return this.appService.addToQueue(fail ? true : false);
  }
}
