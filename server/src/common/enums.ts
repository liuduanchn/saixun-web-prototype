/**
 * 枚举替身（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 背景：Prisma 6 的 SQLite 连接器不支持 `enum`，schema 中 6 个枚举已降级为 String。
 * 本文件提供与 schema 取值**完全一致**的类型替身，避免把 `as` 断言散落到各处。
 *
 * 设计要点：
 *   1. 每个类型都写成「字面量联合 + (string & {})」的宽松形态：
 *      既保留 IDE 的字面量提示，又能直接接受 Prisma 生成的 `string`，
 *      因此 `user.role`（string）可以直接赋给 `Role`，无需任何 cast。
 *   2. 同时导出同名常量对象，兼容 `Role.TEACHER` 这类成员访问写法
 *      （当前全仓 0 处，但保留以防将来引入）。
 *   3. 取值必须与 prisma/schema.prisma 中的字符串默认值保持一致，改动需同步。
 */

export const ROLE_VALUES = ['OWNER', 'TEACHER', 'STUDENT', 'MEMBER'] as const;
export const STAGE_VALUES = [
  'UNDERSTAND',
  'DESIGN',
  'PROTOTYPE',
  'POLISH',
  'DEFENSE',
  'REVIEW',
] as const;
export const TASK_STATUS_VALUES = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'NEEDS_FIX',
  'DONE',
] as const;
export const SEVERITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const DIAGNOSIS_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;
export const RESOURCE_TYPE_VALUES = [
  'TEMPLATE',
  'CASE',
  'QUESTION_BANK',
  'MATERIAL',
] as const;

export type Role = (typeof ROLE_VALUES)[number] | (string & {});
export type Stage = (typeof STAGE_VALUES)[number] | (string & {});
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number] | (string & {});
export type Severity = (typeof SEVERITY_VALUES)[number] | (string & {});
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUS_VALUES)[number] | (string & {});
export type ResourceType = (typeof RESOURCE_TYPE_VALUES)[number] | (string & {});

export const Role = {
  OWNER: 'OWNER',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  MEMBER: 'MEMBER',
} as const;

export const Stage = {
  UNDERSTAND: 'UNDERSTAND',
  DESIGN: 'DESIGN',
  PROTOTYPE: 'PROTOTYPE',
  POLISH: 'POLISH',
  DEFENSE: 'DEFENSE',
  REVIEW: 'REVIEW',
} as const;

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  NEEDS_FIX: 'NEEDS_FIX',
  DONE: 'DONE',
} as const;

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export const DiagnosisStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;

export const ResourceType = {
  TEMPLATE: 'TEMPLATE',
  CASE: 'CASE',
  QUESTION_BANK: 'QUESTION_BANK',
  MATERIAL: 'MATERIAL',
} as const;
