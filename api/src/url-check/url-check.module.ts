import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '../queue/queue.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UrlCheckProcessor } from './url-check.processor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsModule } from '../events/events.module.js';
import { BatchModule } from '../batch/batch.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueueModule,
    EventsModule,
    BatchModule,
    PrismaModule,
  ],
  providers: [UrlCheckProcessor, PrismaService],
})
export class UrlCheckModule {}
