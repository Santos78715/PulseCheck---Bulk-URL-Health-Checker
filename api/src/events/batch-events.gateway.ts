import {
  Injectable,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { BATCH_EVENTS_CHANNEL } from './batch-events.service.js';

@Injectable()
export class BatchEventsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly subscriber: Redis;

  private readonly events = new Subject<MessageEvent>();

  constructor() {
    this.subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async onModuleInit() {
    await this.subscriber.subscribe(BATCH_EVENTS_CHANNEL);

    this.subscriber.on('message', (channel, message) => {
      if (channel !== BATCH_EVENTS_CHANNEL) {
        return;
      }

      let event: { batchId: string; event: string; data: unknown };
      try {
        event = JSON.parse(message) as typeof event;
      } catch {
        return;
      }

      this.events.next({
        type: event.event,
        data: event,
      });
    });
  }

  stream(batchId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const subscription = this.events.subscribe({
        next: (event) => {
          const data = event.data;
          if (
            typeof data === 'object' &&
            data !== null &&
            'batchId' in data &&
            data.batchId === batchId
          ) {
            subscriber.next(event);
          }
        },
        error: (error) => subscriber.error(error),
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  }

  async onModuleDestroy() {
    this.events.complete();

    await this.subscriber.unsubscribe(BATCH_EVENTS_CHANNEL);

    await this.subscriber.quit();
  }
}
