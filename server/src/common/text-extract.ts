import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
// pdf-parse v2 为 PDF.js 封装，导出 PDFParse 类：new PDFParse({ data }).getText()
import { PDFParse } from 'pdf-parse';

export interface ExtractInput {
  buffer: Buffer;
  mimetype?: string;
  filename?: string;
}

function extOf(filename?: string): string {
  if (!filename) return '';
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

function isPlainText(mimetype?: string): boolean {
  return (
    mimetype === 'text/plain' ||
    mimetype === 'text/markdown' ||
    mimetype === 'application/json'
  );
}

/**
 * 从上传文件抽取纯文本，用于赛项解析/作品诊断的内容比对。
 * 支持：txt/md（UTF-8）、docx（mammoth）、pdf（pdf-parse）、doc（二进制可打印串兜底）。
 * 不支持或损坏的文件抛出清晰错误。
 */
export async function extractText(input: ExtractInput): Promise<string> {
  const { buffer, mimetype, filename } = input;
  const ext = extOf(filename);

  // 1) 纯文本
  if (isPlainText(mimetype) || ext === 'txt' || ext === 'md') {
    return buffer.toString('utf-8');
  }

  // 2) DOCX（Office Open XML）
  if (
    mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    } catch (e) {
      throw new BadRequestException(
        `DOCX 内容抽取失败：${(e as Error).message || '文件可能已损坏'}`,
      );
    }
  }

  // 3) PDF
  if (mimetype === 'application/pdf' || ext === 'pdf') {
    try {
      const parser = new PDFParse({ data: buffer });
      try {
        const res = await parser.getText();
        return (res?.text as string) || '';
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    } catch (e) {
      throw new BadRequestException(
        `PDF 内容抽取失败：${(e as Error).message || '文件可能已损坏或加密'}`,
      );
    }
  }

  // 4) DOC（旧版二进制 OLE）：无纯 JS 精确解析库，做可打印串兜底抽取
  if (mimetype === 'application/msword' || ext === 'doc') {
    return scrapePrintable(buffer);
  }

  throw new BadRequestException(
    `不支持的文本抽取类型（${mimetype || '未知'} .${ext || '无扩展名'}），请上传 DOC/DOCX/PDF/TXT 文件`,
  );
}

/** 从二进制（如 .doc）中提取连续可打印 ASCII/中文片段，作为内容兜底 */
function scrapePrintable(buffer: Buffer): string {
  const chunks: string[] = [];
  let current = '';
  for (let i = 0; i < buffer.length; i++) {
    const code = buffer[i];
    const next = buffer[i + 1];
    // 常见可打印 ASCII 或 UTF-8 多字节起始
    const printable =
      (code >= 32 && code <= 126) ||
      code === 9 ||
      code === 10 ||
      code === 13 ||
      code >= 128;
    if (printable) {
      current += String.fromCharCode(code);
      // 中文等多字节：若出现连续的 ASCII 假阳性，长度阈值过滤
      if (current.length > 200) {
        chunks.push(current);
        current = '';
      }
    } else {
      if (current.length >= 4) chunks.push(current);
      current = '';
    }
  }
  if (current.length >= 4) chunks.push(current);
  return chunks.join('\n').replace(/[ \t]+\n/g, '\n').trim();
}
