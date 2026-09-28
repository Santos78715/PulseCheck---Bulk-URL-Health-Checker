import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleInit {
  constructor(
    @InjectQueue('url-check')
    private readonly urlCheckQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.urlCheckQueue.setGlobalConcurrency(5);

    await this.urlCheckQueue.setGlobalRateLimit(10, 1000);

    console.log('Global limits configured: concurrency=5, rate=10/sec');
  }
}
