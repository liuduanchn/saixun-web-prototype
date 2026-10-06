// 赛训智舱前端 API 客户端
// 基础地址：VITE_API_BASE（未配置时走相对路径 /api，配合 vite dev 代理到后端 :8080）
// 鉴权：登录后从后端拿到 access_token + refresh_token，存入 localStorage；
//       access_token 短期有效，请求自动携带 Bearer；遇到 401 自动用 refresh_token 续期一次后重试。
// 演示兜底：当未配置 VITE_API_BASE 时 DEMO_MODE=true，数据驱动的页面回退到内置示例数据，
//          保证未连接后端的线上演示页仍可正常展示。

// 注意：`import.meta.env` 是 Vite 专有对象，在纯 Node 环境（如 `node --test` 跑单测）
// 下为 undefined，直接访问属性会抛 TypeError 导致整个模块无法导入。
// 因此这里统一收敛到一个变量并做容错；Vite 构建时仍会正常注入该对象。
const ENV = import.meta.env || {};

const RAW_BASE = ENV.VITE_API_BASE || "/api";
export const API_BASE = RAW_BASE.replace(/\/$/, "");
export const DEMO_MODE = !ENV.VITE_API_BASE;
export const PROJECT_ID = ENV.VITE_PROJECT_ID || "demo-project";

const TOKEN_KEY = "saixun-token";
const REFRESH_KEY = "saixun-refresh";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** 存储令牌对（登录 / 刷新成功后调用） */
export function setTokens(accessToken, refreshToken) {
  try {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch {
    /* 忽略存储异常 */
  }
}

/** 清除本地所有令牌（登出 / 刷新失败兜底） */
export function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* 忽略存储异常 */
  }
}

// 防止并发 401 触发多次刷新；同一时刻仅允许一次刷新流程
let refreshing = null;

async function doRefresh() {
  if (refreshing) return refreshing;
  const refreshToken = getRefreshToken();
  refreshing = (async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError("刷新失败", res.status);
    const data = text ? JSON.parse(text) : null;
    if (!data || !data.access_token) throw new ApiError("刷新失败", res.status);
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request(path, options = {}, _isRetry = false) {
  const { method = "GET", body, auth = true, isForm = false } = options;
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) {
      // 首选专属头：部署到托管平台后实测「网关会在每个请求上注入它自己的
      // Authorization」，导致后端从标准头取到网关令牌、一律验签失败（登录成功但
      // 所有接口 401）。后端优先读本头，Authorization 仅为兼容标准客户端保留。
      headers["X-Saixun-Auth"] = token;
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let payload;
  if (body !== undefined) {
    if (isForm) {
      payload = body; // FormData，浏览器自动设置 Content-Type
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError("无法连接服务器，请确认后端服务已启动", 0);
  }

  // access_token 过期：尝试用 refresh_token 续期一次后重试原请求（仅一次，避免死循环）
  if (res.status === 401 && !_isRetry && auth) {
    try {
      const newToken = await doRefresh();
      return request(path, options, true);
    } catch {
      clearTokens();
      throw new ApiError("登录已失效，请重新登录", 401);
    }
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data;
}

export const api = {
  auth: {
    async login(username, password) {
      const data = await request("/auth/login", {
        method: "POST",
        body: { username, password },
        auth: false,
      });
      setTokens(data.access_token, data.refresh_token);
      return data.user;
    },
    /** 登出：吊销刷新令牌 + 清除本地令牌（失败也保证本地清除） */
    async logout() {
      const refreshToken = getRefreshToken();
      try {
        await request(
          "/auth/logout",
          { method: "POST", body: refreshToken ? { refresh_token: refreshToken } : {} },
          false,
        );
      } catch {
        /* 忽略：即使后端注销失败，本地令牌也必须清除 */
      } finally {
        clearTokens();
      }
      return { ok: true };
    },
    me() {
      return request("/auth/me");
    },
    changePassword(oldPassword, newPassword) {
      return request("/auth/change-password", {
        method: "POST",
        body: { oldPassword, newPassword },
      });
    },
  },
  // 大模型（平台级）配置：读脱敏视图 / 保存 / 测试连接 / 公开状态
  // 说明：这三个受保护接口只对平台管理员开放，非管理员会收到 403（ApiError.status === 403），
  //      设置中心据此决定是否渲染配置卡片。
  config: {
    status() {
      return request("/config/status");
    },
    llm() {
      return request("/config/llm");
    },
    saveLlm(patch) {
      return request("/config/llm", { method: "PATCH", body: patch });
    },
    testLlm() {
      return request("/config/llm/test", { method: "POST" });
    },
  },
  tenants: {
    mine() {
      return request("/tenants/mine");
    },
    create(name) {
      return request("/tenants", {
        method: "POST",
        body: { name },
      });
    },
    updateSettings(settings) {
      return request("/tenants/me/settings", { method: "PATCH", body: settings });
    },
    switch(tenantId) {
      return request("/tenants/switch", {
        method: "POST",
        body: { tenantId },
      });
    },
    me() {
      return request("/tenants/me");
    },
    rename(name) {
      return request("/tenants/me", {
        method: "PATCH",
        body: { name },
      });
    },
    members() {
      return request("/tenants/members");
    },
    addMember(username, role) {
      return request("/tenants/members", {
        method: "POST",
        body: { username, role },
      });
    },
    removeMember(userId) {
      return request(`/tenants/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
    },
  },
  tasks: {
    /**
     * 任务列表。后端走分页且默认 pageSize=20，看板场景下会静默截断
     * （后端MAX_PAGE_SIZE=100），故显式请求 100 条把该项目的任务一次取全。
     * 驾驶舱只展示前 5 条，无需分页控件。
     */
    list(projectId, pageSize = 100) {
      return request(`/tasks?projectId=${encodeURIComponent(projectId)}&pageSize=${pageSize}`);
    },
    coverage(projectId) {
      return request(`/tasks/coverage?projectId=${encodeURIComponent(projectId)}`);
    },
    create(dto) {
      return request("/tasks", { method: "POST", body: dto });
    },
    update(id, dto) {
      return request(`/tasks/${id}`, { method: "PATCH", body: dto });
    },
    remove(id) {
      return request(`/tasks/${id}`, { method: "DELETE" });
    },
    /**
     * AI 生成阶段任务草稿（不落库，教师确认后再批量创建）。
     * 响应含 source 字段：'ai' 走真实模型，'heuristic' 表示未配置 Key 已降级。
     */
    aiGenerate(projectId) {
      return request("/tasks/ai-generate", { method: "POST", body: { projectId } });
    },
    /** AI 动态风险预警（替代此前写死的文案） */
    aiRisk(projectId) {
      return request(`/tasks/ai-risk?projectId=${encodeURIComponent(projectId)}`);
    },
    /** AI 推荐任务应关联的评分点（只给建议，不改关联关系） */
    aiSuggest(projectId) {
      return request(`/tasks/ai-suggest?projectId=${encodeURIComponent(projectId)}`);
    },
  },
  works: {
    /**
     * 项目作品列表。诊断页要取「最新版本」，若被分页截断会误判为旧版本，
     * 故与任务列表一致显式放大 pageSize。
     */
    list(projectId, pageSize = 100) {
      return request(`/works?projectId=${encodeURIComponent(projectId)}&pageSize=${pageSize}`);
    },
    mine(pageSize = 100) {
      return request(`/works/mine?pageSize=${pageSize}`);
    },
    upload(projectId, file) {
      const form = new FormData();
      form.append("file", file);
      return request(`/works?projectId=${encodeURIComponent(projectId)}`, {
        method: "POST",
        body: form,
        isForm: true,
      });
    },
    get(id) {
      return request(`/works/${id}`);
    },
    remove(id) {
      return request(`/works/${id}`, { method: "DELETE" });
    },
  },
  diagnosis: {
    analyze(workVersionId) {
      return request("/diagnosis", { method: "POST", body: { workVersionId } });
    },
    list(workVersionId) {
      return request(`/diagnosis?workVersionId=${encodeURIComponent(workVersionId)}`);
    },
    /** 学生端「诊断反馈」取全量（后端默认 20 条会截断）。 */
    mine(pageSize = 100) {
      return request(`/diagnosis/mine?pageSize=${pageSize}`);
    },
    review(id, status) {
      return request(`/diagnosis/${id}`, { method: "PATCH", body: { status } });
    },
  },
  files: {
    url(key) {
      return `${API_BASE}/files/${encodeURIComponent(key)}`;
    },
  },
  criteria: {
    list(projectId) {
      return request(`/criteria?projectId=${encodeURIComponent(projectId)}`);
    },
    parse(text) {
      return request("/criteria/parse", { method: "POST", body: { text } });
    },
    confirm(projectId, draft) {
      return request("/criteria/confirm", {
        method: "POST",
        body: { projectId, draft },
      });
    },
    parseFile(projectId, file) {
      const form = new FormData();
      form.append("file", file);
      return request(`/criteria/parse-file?projectId=${encodeURIComponent(projectId)}`, {
        method: "POST",
        body: form,
        isForm: true,
      });
    },
    remove(id) {
      return request(`/criteria/${id}`, { method: "DELETE" });
    },
    removeScorePoint(id) {
      return request(`/criteria/score-points/${id}`, { method: "DELETE" });
    },
  },
  defense: {
    create(projectId, maxRounds = 3) {
      return request("/defense/sessions", {
        method: "POST",
        body: { projectId, maxRounds },
      });
    },
    answer(id, answer) {
      return request(`/defense/sessions/${id}/answer`, {
        method: "POST",
        body: { answer },
      });
    },
    list(projectId) {
      return request(`/defense/sessions?projectId=${encodeURIComponent(projectId)}`);
    },
    get(id) {
      return request(`/defense/sessions/${id}`);
    },
    delete(id) {
      return request(`/defense/sessions/${id}`, { method: "DELETE" });
    },
    rename(id, title) {
      return request(`/defense/sessions/${id}`, { method: "PATCH", body: { title } });
    },
  },
  projects: {
    list() {
      return request("/projects");
    },
  },
  speech: {
    transcribe(file) {
      const form = new FormData();
      form.append("audio", file);
      return request("/speech/transcribe", { method: "POST", body: form, isForm: true });
    },
  },
  resources: {
    list(projectId) {
      return request(`/resources?projectId=${encodeURIComponent(projectId)}`);
    },
    upload(projectId, file, meta) {
      const form = new FormData();
      form.append("file", file);
      if (meta?.type) form.append("type", meta.type);
      if (meta?.name) form.append("name", meta.name);
      if (meta?.description) form.append("description", meta.description);
      return request(`/resources?projectId=${encodeURIComponent(projectId)}`, {
        method: "POST",
        body: form,
        isForm: true,
      });
    },
    remove(id) {
      return request(`/resources/${id}`, { method: "DELETE" });
    },
    url(key) {
      return `${API_BASE}/files/${encodeURIComponent(key)}`;
    },
  },
  review: {
    summary(projectId) {
      return request(`/review/summary?projectId=${encodeURIComponent(projectId)}`);
    },
    caseLibrary(projectId) {
      return request(`/review/case-library?projectId=${encodeURIComponent(projectId)}`);
    },
  },
  learning: {
    events() {
      return request(`/learning/events`);
    },
    summary() {
      return request(`/learning/summary`);
    },
  },
  notifications: {
    /** 通知面板一次性取全（后端默认 20 条会截断未读数），故放大 pageSize。 */
    list(pageSize = 100) {
      return request(`/notifications?pageSize=${pageSize}`);
    },
    markRead(id) {
      return request(`/notifications/${id}/read`, { method: "PATCH" });
    },
    markAllRead() {
      return request(`/notifications/read-all`, { method: "POST" });
    },
  },
};

/**
 * 下载文件：带鉴权头取 blob，再触发浏览器保存。
 * ------------------------------------------------------------------
 * 为什么不能直接用 <a href={url} download>：
 *   后端 `GET /api/files/*`（storage.controller）要求请求头携带 X-Saixun-Auth，
 *   并校验「路径必须落在当前用户租户目录内」；而浏览器对 <a> 跳转/新标签页
 *   **不会**附加自定义请求头，直接点必定 401。因此改为 fetch 取 blob。
 * 顺带修掉一个既有缺陷：资源名称原先也是 <a href>，同样点不开。
 *
 * @param {string} url      服务端返回的 origin 绝对地址（/api/files/<tenant>/<file>）
 * @param {string} fileName 保存文件名（含扩展名）
 */
export async function downloadFile(url, fileName = "download") {
  const token = getToken();
  const headers = token ? { "X-Saixun-Auth": token, Authorization: `Bearer ${token}` } : {};

  let res;
  try {
    res = await fetch(url, { headers });
  } catch {
    throw new ApiError("无法连接服务器，下载失败", 0);
  }

  // access_token 过期：续期一次后重试（与 request() 的策略保持一致）
  if (res.status === 401) {
    try {
      const fresh = await doRefresh();
      res = await fetch(url, { headers: { "X-Saixun-Auth": fresh, Authorization: `Bearer ${fresh}` } });
    } catch {
      clearTokens();
      throw new ApiError("登录已失效，请重新登录", 401);
    }
  }

  if (!res.ok) throw new ApiError(`下载失败（${res.status}）`, res.status);

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立即 revoke 在部分浏览器会中断下载，延后释放
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  return true;
}
