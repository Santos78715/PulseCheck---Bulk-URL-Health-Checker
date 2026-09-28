import { Global, Module } from '@nestjs/common';
import { BatchEventsService } from './batch-events.service.js';
import { BatchEventsGateway } from './batch-events.gateway.js';
import { BatchCacheService } from '../batch/batch-cache.service.js';

@Global()
@Module({
  providers: [BatchEventsService, BatchEventsGateway, BatchCacheService],
  exports: [BatchEventsService, BatchEventsGateway, BatchCacheService],
})
export class EventsModule {}
