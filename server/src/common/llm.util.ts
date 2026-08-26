/**
 * 从模型返回文本中尽量稳妥地提取 JSON（对象或数组）。
 * 模型常在 JSON 前后附带说明文字，这里截取首个 { 或 [ 到最后一个 } 或 ]。
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const startObj = raw.indexOf('{');
  const startArr = raw.indexOf('[');
  let start = -1;
  let endChar = '';
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
    start = startObj;
    endChar = '}';
  } else if (startArr >= 0) {
    start = startArr;
    endChar = ']';
  }
  if (start < 0) return null;
  const end = raw.lastIndexOf(endChar);
  if (end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
