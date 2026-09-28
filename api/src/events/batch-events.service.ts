import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

export const BATCH_EVENTS_CHANNEL = 'batch-events';

@Injectable()
export class BatchEventsService implements OnModuleDestroy {
  private readonly publisher: Redis;

  constructor() {
    this.publisher = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async publish(batchId: string, event: string, data: unknown) {
    await this.publisher.publish(
      BATCH_EVENTS_CHANNEL,
      JSON.stringify({
        batchId,
        event,
        data,
      }),
    );
  }

  async cancelUrlCheck(urlCheckId: string) {
    await this.publisher.publish('url-check:cancel', JSON.stringify({ urlCheckId }));
  }

  async onModuleDestroy() {
    await this.publisher.quit();
  }
}
