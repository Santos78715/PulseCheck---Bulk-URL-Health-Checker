import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of } from 'rxjs';
import { BatchController } from '../src/batch/batch.controller.js';
import { BatchService } from '../src/batch/batch.service.js';
import { BatchEventsGateway } from '../src/events/batch-events.gateway.js';

describe('Batch API (e2e)', () => {
  let app: INestApplication;
  const service = {
    createBatch: vi.fn(async (dto) => ({ id: 'batch-1', urls: dto.urls })),
    getBatch: vi.fn(async (id: string) => ({ id })),
    getBatches: vi.fn(async () => [{ id: 'batch-1' }]),
    cancelBatch: vi.fn(async (id: string) => ({ id, status: 'CANCELLED' })),
    retryFailedUrls: vi.fn(async (id: string) => ({ batchId: id, retriedCount: 1 })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BatchController],
      providers: [
        { provide: BatchService, useValue: service },
        { provide: BatchEventsGateway, useValue: { stream: () => of() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => app.close());

  it('lists batches through the HTTP endpoint', async () => {
    await request(app.getHttpServer()).get('/batches').expect(200, [{ id: 'batch-1' }]);
  });

  it('ingests URL rows from a CSV multipart upload', async () => {
    await request(app.getHttpServer())
      .post('/batches/csv')
      .attach('file', Buffer.from('url\nhttps://example.com\nhttps://example.org'), 'urls.csv')
      .expect(201, {
        id: 'batch-1',
        urls: ['https://example.com', 'https://example.org'],
      });
  });

  it('rejects invalid CSV URLs before creating a batch', async () => {
    await request(app.getHttpServer())
      .post('/batches/csv')
      .attach('file', Buffer.from('url\nnot-a-url'), 'urls.csv')
      .expect(400);
    expect(service.createBatch).toHaveBeenCalledTimes(1);
  });
});
