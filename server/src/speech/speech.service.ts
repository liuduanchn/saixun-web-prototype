import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AudioInput {
  buffer: Buffer;
  mimetype?: string;
}

/**
 * 语音转文本服务：调用线上 ASR 接口（密钥仅存于后端 Tenant.settings，绝不暴露给前端）。
 * 配置项（Tenant.settings JSON）：
 *   asrProvider    — 服务商预设：siliconflow / custom（仅前端展示用，后端按其余字段转发）
 *   asrApiKey      — ASR 服务 API Key（必填）
 *   asrEndpoint    — ASR 接口地址（必填，接收 multipart 音频字段）
 *   asrHeaderName  — 鉴权头名称，默认 Authorization
 *   asrAuthScheme  — 鉴权头前缀，默认 Bearer
 *   asrField       — 音频字段名，默认 file（硅基流动使用 file）
 *   asrModel       — 模型名称，默认 FunAudioLLM/SenseVoiceSmall（硅基流动必填）
 */
@Injectable()
export class SpeechService {
  constructor(private readonly prisma: PrismaService) {}

  async transcribe(tenantId: string, audio: AudioInput): Promise<{ transcript: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = ((tenant?.settings as Record<string, unknown>) || {}) as Record<string, string>;
    const {
      asrApiKey,
      asrEndpoint,
      asrHeaderName = 'Authorization',
      asrAuthScheme = 'Bearer',
      asrField = 'file',
      asrModel = 'FunAudioLLM/SenseVoiceSmall',
    } = settings;

    if (!asrApiKey || !asrEndpoint) {
      throw new BadRequestException(
        '尚未配置语音识别服务：请在设置中心填写 ASR API Key 与接口地址',
      );
    }
    if (!asrModel) {
      throw new BadRequestException(
        '尚未配置语音识别模型：请在设置中心填写 ASR 模型名称（如 FunAudioLLM/SenseVoiceSmall）',
      );
    }

    const form = new FormData();
    // Buffer 拷贝为 Uint8Array（确保底层为普通 ArrayBuffer，满足 Blob 类型约束）
    const audioBytes = new Uint8Array(audio.buffer.byteLength);
    audio.buffer.copy(audioBytes);
    const ext = (audio.mimetype || 'audio/wav').split('/')[1]?.split(';')[0] || 'bin';
    form.append(
      asrField,
      new Blob([audioBytes], { type: audio.mimetype || 'audio/wav' }),
      `recording.${ext}`,
    );
    form.append('model', asrModel);

    const headers: Record<string, string> = {};
    headers[asrHeaderName] = `${asrAuthScheme} ${asrApiKey}`;

    let res: Response;
    try {
      res = await fetch(asrEndpoint, { method: 'POST', body: form, headers });
    } catch (e) {
      throw new BadRequestException(`调用 ASR 接口失败：${(e as Error).message || '网络错误'}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`ASR 接口返回 ${res.status}：${text.slice(0, 200)}`);
    }
    const data: any = await res.json().catch(() => null);
    const transcript =
      data?.transcript ?? data?.text ?? data?.result ?? (typeof data === 'string' ? data : '');
    if (!transcript) throw new BadRequestException('ASR 接口未返回可识别文本');
    return { transcript: String(transcript) };
  }
}
