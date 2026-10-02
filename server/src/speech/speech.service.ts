import { Injectable, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseJson } from '../common/json';

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

  // 单个模型单次调用（带超时）；返回文本，失败抛 HttpException（含真实状态码）
  private async callAsr(
    endpoint: string,
    headers: Record<string, string>,
    asrField: string,
    audioBytes: Uint8Array,
    mimetype: string,
    ext: string,
    model: string,
    timeoutMs: number,
  ): Promise<string> {
    const form = new FormData();
    form.append(
      asrField,
      new Blob([audioBytes.buffer as ArrayBuffer], { type: mimetype || 'audio/wav' }),
      `recording.${ext}`,
    );
    form.append('model', model);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        body: form,
        headers,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const reason = (e as Error).name === 'AbortError' ? 'ASR 接口响应超时' : (e as Error).message || '网络错误';
      throw new BadRequestException(`调用 ASR 接口失败：${reason}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      // 解析硅基流动错误体 {code, message}；取 message 给用户更友好提示
      let msg = raw.slice(0, 200);
      try {
        const j = JSON.parse(raw);
        if (j?.message) msg = j.message;
      } catch {
        /* 非 JSON，使用原文截断 */
      }
      // 使用真实状态码，便于上层判断 503/504 进行重试
      throw new HttpException(`ASR 接口返回 ${res.status}：${msg}`, res.status);
    }

    const data: any = await res.json().catch(() => null);
    const transcript =
      data?.transcript ?? data?.text ?? data?.result ?? (typeof data === 'string' ? data : '');
    if (!transcript) throw new BadRequestException('ASR 接口未返回可识别文本');
    return String(transcript);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async transcribe(tenantId: string, audio: AudioInput): Promise<{ transcript: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = parseJson<Record<string, string>>(tenant?.settings, {});
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

    const audioBytes = new Uint8Array(audio.buffer.byteLength);
    audio.buffer.copy(audioBytes);
    const ext = (audio.mimetype || 'audio/wav').split('/')[1]?.split(';')[0] || 'bin';

    const headers: Record<string, string> = {};
    headers[asrHeaderName] = `${asrAuthScheme} ${asrApiKey}`;

    // 候选模型：主模型优先；若主模型非备用模型，则将备用模型作为降级（硅基流动繁忙时自动切换）
    const FALLBACK_MODEL = 'TeleAI/TeleSpeechASR';
    const candidates = [asrModel];
    if (asrModel !== FALLBACK_MODEL) candidates.push(FALLBACK_MODEL);

    const TIMEOUT_MS = 60_000;
    let lastErr: unknown = null;

    for (let ci = 0; ci < candidates.length; ci++) {
      const model = candidates[ci];
      let retried = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const transcript = await this.callAsr(
            asrEndpoint,
            headers,
            asrField,
            audioBytes,
            audio.mimetype || 'audio/wav',
            ext,
            model,
            TIMEOUT_MS,
          );
          return { transcript };
        } catch (e) {
          lastErr = e;
          const status = e instanceof HttpException ? e.getStatus() : 0;
          // 仅对 503（模型过载）/504（网关超时）做指数退避重试
          if (status !== 503 && status !== 504) break;
          retried = true;
          await this.sleep(attempt === 0 ? 1000 : attempt === 1 ? 2000 : 4000);
        }
      }
      // 当前模型已用尽重试仍失败：若还有降级模型则继续，否则跳出
      if (retried && ci < candidates.length - 1) {
        // 进入下一个降级模型
      } else if (!retried) {
        break; // 非 503/504 错误，无需重试与降级
      }
    }

    if (lastErr instanceof HttpException) throw lastErr;
    throw new BadRequestException((lastErr as Error)?.message || '语音识别失败');
  }
}
