import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service.js';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),

    BullModule.registerQueue({
      name: 'url-check',
    }),
  ],
  exports: [BullModule],
  providers: [QueueService],
})
export class QueueModule {}
