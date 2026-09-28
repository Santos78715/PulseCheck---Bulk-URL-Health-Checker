import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class BatchCacheService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  private readonly key = 'batches:list';
  private readonly versionKey = 'batches:list:version';

  async invalidate() {
    await this.redis.multi().incr(this.versionKey).del(this.key).exec();
  }

  async getList<T>(): Promise<T | null> {
    const value = await this.redis.get(this.key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async getVersion() {
    return (await this.redis.get(this.versionKey)) ?? '0';
  }

  async setListIfVersion(value: unknown, version: string) {
    await this.redis.eval(
      "if (redis.call('get', KEYS[1]) or '0') == ARGV[1] then redis.call('set', KEYS[2], ARGV[2], 'EX', 30); return 1 else return 0 end",
      2,
      this.versionKey,
      this.key,
      version,
      JSON.stringify(value),
    );
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
