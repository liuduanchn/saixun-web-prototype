import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UseFilters,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { MAX_FILE_SIZE } from '../storage/file-policy';
import { FileUploadFilter } from '../storage/multer-exception.filter';
import { SpeechService } from './speech.service';

@Controller('speech')
@UseGuards(JwtAuthGuard)
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  /** 语音转文本：上传音频（webm/mp3/wav，≤20MB），由后端代理调用线上 ASR 接口（密钥不暴露给前端） */
  @Post('transcribe')
  @UseFilters(FileUploadFilter)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: multer.memoryStorage(),
      limits: { fileSize: Math.min(MAX_FILE_SIZE, 25 * 1024 * 1024) },
    }),
  )
  transcribe(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0)
      throw new BadRequestException('未接收到音频');
    return this.speech.transcribe(user.tenantId, {
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
  }
}
