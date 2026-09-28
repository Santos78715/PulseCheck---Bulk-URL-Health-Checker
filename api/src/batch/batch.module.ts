import { Module } from '@nestjs/common';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { EventsModule } from '../events/events.module.js';

@Module({
  imports: [PrismaModule, QueueModule, EventsModule],
  controllers: [BatchController],
  providers: [BatchService],
})
export class BatchModule {}
