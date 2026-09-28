import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUrl,
} from 'class-validator';

export class CreateBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUrl({}, { each: true })
  urls: string[];
}