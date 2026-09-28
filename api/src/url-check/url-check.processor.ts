import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service.js';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BatchEventsService } from '../events/batch-events.service.js';
import { BatchCacheService } from '../batch/batch-cache.service.js';

@Processor('url-check', {
  concurrency: 5,
})
export class UrlCheckProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly redisSubscriber: Redis;

  private readonly controllers = new Map<string, AbortController>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchEventsService: BatchEventsService,
    private readonly batchCache: BatchCacheService,
  ) {
    super();
    this.redisSubscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  private isTransientStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  async process(job: Job<{ urlCheckId: string }>) {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    console.log(
      `JOB ${job.id} | URL ${job.data.urlCheckId} | ATTEMPT ${attempt}/${maxAttempts}`,
    );

    const urlCheck = await this.prisma.urlCheck.findUnique({
      where: {
        id: job.data.urlCheckId,
      },
    });

    if (!urlCheck) {
      throw new Error(`UrlCheck ${job.data.urlCheckId} not found`);
    }

    const claimed = await this.prisma.urlCheck.updateMany({
      where: {
        id: urlCheck.id,
        status: 'QUEUED',
      },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      console.log(`SKIP | URL ${urlCheck.id} | already cancelled or claimed`);

      return {
        skipped: true,
      };
    }

    const controller = new AbortController();

    this.controllers.set(urlCheck.id, controller);

    await this.prisma.batch.updateMany({
      where: {
        id: urlCheck.batchId,
        status: {
          not: 'COMPLETED',
        },
      },
      data: {
        status: 'RUNNING',
      },
    });
    await this.batchCache.invalidate();
    await this.batchEventsService.publish(urlCheck.batchId, 'batch.updated', { status: 'RUNNING' });

    try {
      const start = Date.now();

      const response = await axios.get(urlCheck.url, {
        timeout: 10000,
        validateStatus: () => true,
        signal: controller.signal,
      });

      const responseTimeMs = Date.now() - start;

      console.log(
        `END ${urlCheck.id} | STATUS ${response.status} | ${responseTimeMs}ms`,
      );

      if (this.isTransientStatus(response.status)) {
        throw new Error(`Transient HTTP error: ${response.status}`);
      }

      if (response.status >= 400) {
        await this.completeBatchUrl(urlCheck.id, urlCheck.batchId, {
          status: 'FAILED',
          httpStatus: response.status,
          responseTimeMs,
          error: `HTTP ${response.status}`,
          attempts: attempt,
        });

        return {
          status: response.status,
          responseTimeMs,
        };
      }

      await this.completeBatchUrl(urlCheck.id, urlCheck.batchId, {
        status: 'SUCCESS',
        httpStatus: response.status,
        responseTimeMs,
        attempts: attempt,
      });

      console.log(
        `SUCCESS | URL ${urlCheck.id} | ATTEMPT ${attempt}/${maxAttempts}`,
      );

      return {
        status: response.status,
        responseTimeMs,
      };
    } catch (error) {
      if (axios.isCancel(error)) {
        await this.completeBatchUrl(urlCheck.id, urlCheck.batchId, {
          status: 'CANCELLED',
          error: 'Cancelled by user',
          attempts: job.attemptsMade + 1,
        });

        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';

      const isLastAttempt = attempt >= maxAttempts;

      if (isLastAttempt) {
        await this.completeBatchUrl(urlCheck.id, urlCheck.batchId, {
          status: 'FAILED',
          error: message,
          attempts: attempt,
        });

        console.log(
          `FAILED | URL ${urlCheck.id} | ATTEMPT ${attempt}/${maxAttempts}`,
        );
      } else {
        await this.retryUrl(urlCheck.id, message, attempt);

        console.log(
          `RETRY | URL ${urlCheck.id} | ATTEMPT ${attempt}/${maxAttempts}`,
        );
      }

      throw error;
    } finally {
      this.controllers.delete(urlCheck.id);
    }
  }

  private async retryUrl(urlCheckId: string, error: string, attempt: number) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.urlCheck.updateMany({
        where: {
          id: urlCheckId,
          status: 'RUNNING',
        },
        data: {
          status: 'QUEUED',
          error,
          attempts: attempt,
          completedAt: null,
        },
      });

      if (result.count === 0) {
        const current = await tx.urlCheck.findUnique({
          where: {
            id: urlCheckId,
          },
          select: {
            status: true,
            attempts: true,
          },
        });

        if (!current) {
          throw new Error(`UrlCheck ${urlCheckId} not found`);
        }

        if (
          current.status === 'SUCCESS' ||
          current.status === 'FAILED' ||
          current.status === 'CANCELLED'
        ) {
          return current;
        }

        throw new Error(`Retry transition failed for ${urlCheckId}`);
      }

      await this.batchCache.invalidate();

      return {
        status: 'QUEUED',
        attempts: attempt,
      };
    });
  }

  private async completeBatchUrl(
    urlCheckId: string,
    batchId: string,
    data: {
      status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
      httpStatus?: number;
      responseTimeMs?: number;
      error?: string;
      attempts: number;
    },
  ) {
    const batch = await this.prisma.$transaction(async (tx) => {
      const result = await tx.urlCheck.updateMany({
        where: {
          id: urlCheckId,
          status: {
            in: ['QUEUED', 'RUNNING'],
          },
        },
        data: {
          status: data.status,
          httpStatus: data.httpStatus ?? null,
          responseTimeMs: data.responseTimeMs ?? null,
          error: data.error ?? null,
          attempts: data.attempts,
          completedAt: new Date(),
        },
      });

      if (result.count === 0) {
        console.log(
          `SKIP TERMINAL UPDATE | URL ${urlCheckId} | already terminal`,
        );

        return null;
      }

      const batch = await tx.batch.update({
        where: {
          id: batchId,
        },
        data: {
          completedUrls: {
            increment: 1,
          },
          ...(data.status === 'FAILED'
            ? {
                failedUrls: {
                  increment: 1,
                },
              }
            : {}),
          ...(data.status === 'CANCELLED'
            ? { cancelledUrls: { increment: 1 } }
            : {}),
        },
      });
      await this.batchCache.invalidate();

      if (batch.completedUrls === batch.totalUrls) {
        await tx.batch.update({
          where: {
            id: batchId,
          },
          data: {
            status: batch.cancelledUrls > 0 || data.status === 'CANCELLED'
              ? 'CANCELLED'
              : 'COMPLETED',
          },
        });
      }

      return batch;
    });

    await this.batchEventsService.publish(batchId, 'url.updated', {
      urlCheckId,
      status: data.status,
    });
    await this.batchEventsService.publish(batchId, 'batch.updated', {
      status: batch && batch.completedUrls === batch.totalUrls
        ? (batch.cancelledUrls > 0 || data.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED')
        : 'RUNNING',
    });

    return batch;
  }
  async onModuleInit() {
    await this.redisSubscriber.subscribe('url-check:cancel');

    this.redisSubscriber.on('message', (channel, message) => {
      if (channel !== 'url-check:cancel') {
        return;
      }

      const { urlCheckId } = JSON.parse(message);

      const controller = this.controllers.get(urlCheckId);

      if (!controller) {
        return;
      }

      console.log(`CANCEL REQUEST | URL ${urlCheckId}`);

      controller.abort();
    });
  }

  async onModuleDestroy() {
    await this.redisSubscriber.unsubscribe('url-check:cancel');

    await this.redisSubscriber.quit();
  }
}
