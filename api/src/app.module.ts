import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { BatchModule } from './batch/batch.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BatchModule, QueueModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
