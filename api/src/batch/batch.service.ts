import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BatchCacheService } from './batch-cache.service.js';
import { BatchEventsService } from '../events/batch-events.service.js';

@Injectable()
export class BatchService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('url-check')
    private readonly urlcheck: Queue,
    private readonly cache: BatchCacheService,
    private readonly events: BatchEventsService,
  ) {
  }

  async createBatch(dto: CreateBatchDto) {
    const batch = await this.prisma.batch.create({
      data: {
        totalUrls: dto.urls.length,
        urlChecks: {
          create: dto.urls.map((url) => {
            return {
              url: url,
            };
          }),
        },
      },
      include: {
        urlChecks: true,
      },
    });

    for (const url of batch.urlChecks) {
      await this.urlcheck.add(
        'check-url',
        {
          urlCheckId: url.id,
        },
        {
          attempts: 4,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }
    await this.cache.invalidate();
    await this.events.publish(batch.id, 'batch.updated', { status: batch.status });
    return batch;
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: {
        id: batchId,
      },
      include: {
        urlChecks: true,
      },
    });

    if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);
    return batch;
  }

  async cancelBatch(batchId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: {
          id: batchId,
        },
      });

      if (!batch) {
        throw new NotFoundException(`Batch ${batchId} not found`);
      }

      if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
        return batch;
      }

      const result = await tx.urlCheck.updateMany({
        where: {
          batchId,
          status: 'QUEUED',
        },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      const running = await tx.urlCheck.findMany({
        where: { batchId, status: 'RUNNING' },
        select: { id: true },
      });

      const remaining = await tx.urlCheck.count({
        where: {
          batchId,
          status: {
            in: ['QUEUED', 'RUNNING'],
          },
        },
      });

      const updated = await tx.batch.update({
        where: {
          id: batchId,
        },
        data: {
          completedUrls: { increment: result.count },
          cancelledUrls: { increment: result.count },
          ...(remaining === 0 ? { status: 'CANCELLED' as const } : {}),
        },
      });
      return { batch: updated, runningIds: running.map(({ id }) => id) };
    });
    await this.cache.invalidate();
    const normalized = 'batch' in result ? result.batch : result;
    const runningIds = 'runningIds' in result ? result.runningIds : [];
    for (const urlCheckId of runningIds) await this.events.cancelUrlCheck(urlCheckId);
    await this.events.publish(batchId, 'batch.updated', { status: normalized.status });
    return normalized;
  }

  async retryFailedUrls(batchId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new NotFoundException(`Batch ${batchId} not found`);
      }

      const failedUrls = await tx.urlCheck.findMany({
        where: {
          batchId,
          status: 'FAILED',
        },
        select: {
          id: true,
        },
      });

      if (failedUrls.length === 0) {
        return {
          batchId,
          retriedCount: 0,
          urlCheckIds: [],
        };
      }

      const updated = await tx.urlCheck.updateMany({
        where: {
          batchId,
          status: 'FAILED',
        },
        data: {
          status: 'QUEUED',
          error: null,
          httpStatus: null,
          responseTimeMs: null,
          pageTitle: null,
          attempts: 0,
          startedAt: null,
          completedAt: null,
        },
      });

      if (updated.count === 0) {
        return {
          batchId,
          retriedCount: 0,
          urlCheckIds: [],
        };
      }

      await tx.batch.update({
        where: {
          id: batchId,
        },
        data: {
          status: 'RUNNING',
        },
      });

      return {
        batchId,
        retriedCount: updated.count,
        urlCheckIds: failedUrls.map(({ id }) => id),
      };
    });

    await this.cache.invalidate();
    await this.events.publish(batchId, 'batch.updated', { status: 'RUNNING' });
    // Transaction has committed successfully.
    // Now create BullMQ jobs.
    for (const urlCheckId of result.urlCheckIds) {
      await this.urlcheck.add(
        'check-url',
        { urlCheckId },
        {
          attempts: 4,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    return result;
  }

  async getBatches() {
    const version = await this.cache.getVersion();
    const cached = await this.cache.getList<unknown[]>();

    if (cached) {
      return cached;
    }

    const batches = await this.prisma.batch.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    await this.cache.setListIfVersion(batches, version);

    return batches;
  }
}
