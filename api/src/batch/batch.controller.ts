import { BadRequestException, Body, Controller, Get, MessageEvent, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { Observable } from 'rxjs';
import { BatchEventsGateway } from '../events/batch-events.gateway.js';
import { Sse } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('batches')
export class BatchController {
  constructor(
    private readonly batchService: BatchService,
    private readonly batchEventsGateway: BatchEventsGateway,
  ) {}

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.batchService.createBatch(dto);
  }

  @Post('csv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  createFromCsv(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file || !['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype)) {
      throw new BadRequestException('Upload a CSV file using the "file" field');
    }
    const rows = file.buffer.toString('utf8').split(/\r?\n/).filter((line) => line.trim());
    if (!rows.length) throw new BadRequestException('CSV file is empty');
    const urls = rows.map((row) => row.split(',')[0].trim().replace(/^"|"$/g, ''));
    if (/^url$/i.test(urls[0])) urls.shift();
    if (!urls.length || urls.length > 1000) throw new BadRequestException('CSV must contain between 1 and 1000 URLs');
    if (urls.some((url) => {
      try {
        const parsed = new URL(url);
        return !['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return true;
      }
    })) throw new BadRequestException('CSV contains an invalid URL');
    return this.batchService.createBatch({ urls });
  }

  @Get()
  list() {
    return this.batchService.getBatches();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.batchService.getBatch(id);
  }

  @Post(':id/cancel') cancel(@Param('id') id: string) {
    return this.batchService.cancelBatch(id);
  }

  @Post(':id/retry') retryFailed(@Param('id') id: string) {
    return this.batchService.retryFailedUrls(id);
  }

  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.batchEventsGateway.stream(id);
  }
}
