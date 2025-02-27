/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Request,
  Response,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '@nestjs/passport';
import loginPageTemplate from './view/login';
import { AuthExceptionFilter } from './exception-filter';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('login')
  loginPage(@Request() req: FastifyRequest, @Response() res: FastifyReply) {
    res.type('text/html').send(loginPageTemplate(!!(req.query as any).invalid));
  }

  @Post('login')
  @UseFilters(AuthExceptionFilter)
  @UseGuards(AuthGuard('local'))
  login(@Request() req: FastifyRequest, @Response() reply: FastifyReply) {
    req.session.set('sev-data' as never, (req as any)?.user as never);
    return reply.status(302).redirect('/queues');
  }
}
