vi.mock('ioredis', () => ({
  Redis: class {
    subscribe() { return Promise.resolve(1); }
    unsubscribe() { return Promise.resolve(1); }
    quit() { return Promise.resolve('OK'); }
  },
}));

import { UrlCheckProcessor } from './url-check.processor.js';

describe('UrlCheckProcessor state races', () => {
  it('counts a URL completion only once when duplicate completions race', async () => {
    let state = 'RUNNING';
    let completedUrls = 0;
    let updateCount = 0;
    const prisma = {
      $transaction: async (work: (tx: any) => Promise<unknown>) => work({
        urlCheck: {
          updateMany: async () => {
            if (state !== 'RUNNING') return { count: 0 };
            state = 'SUCCESS';
            updateCount += 1;
            return { count: 1 };
          },
        },
        batch: {
          update: async ({ data }: { data: { completedUrls?: { increment: number }; status?: string } }) => {
            if (data.completedUrls) completedUrls += data.completedUrls.increment;
            return {
              id: 'batch-1', status: data.status ?? 'RUNNING', totalUrls: 1,
              completedUrls, failedUrls: 0, cancelledUrls: 0,
            };
          },
        },
      }),
    };
    const events = { publish: async () => undefined };
    const cache = { invalidate: async () => undefined };
    const processor = new UrlCheckProcessor(prisma as never, events as never, cache as never);
    const complete = (processor as any).completeBatchUrl.bind(processor);
    const data = { status: 'SUCCESS', attempts: 1 };

    await Promise.all([
      complete('url-1', 'batch-1', data),
      complete('url-1', 'batch-1', data),
    ]);

    expect(updateCount).toBe(1);
    expect(completedUrls).toBe(1);
    await processor.onModuleDestroy();
  });
});
