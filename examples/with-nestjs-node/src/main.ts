import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter as NestNodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module.js';
const app = await NestFactory.create(AppModule, new NestNodeAdapter());
app.enableShutdownHooks();
await app.listen(3000, '127.0.0.1');
Logger.log('Bull Board is available at http://localhost:3000/queues', 'Bootstrap');
