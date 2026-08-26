import { useState } from "react";
import { Eye, EyeSlash, LockKey, SignIn, Sparkle, User } from "@phosphor-icons/react";
import { api, DEMO_MODE } from "./api.js";
import { saveSession } from "./appState.js";

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = await api.auth.login(username, password);
      if (!saveSession(window.localStorage, user)) {
        setError("无法保存登录状态，请检查浏览器存储权限");
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(err?.message || "登录失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-story" aria-label="赛训智舱产品介绍">
        <div className="login-brand"><span><Sparkle size={24} weight="fill" /></span><strong>赛训智舱</strong><small>AI 备赛教练</small></div>
        <div className="login-story-copy">
          <span className="login-eyebrow">教学智能体 · 竞赛训练场景</span>
          <h1>从赛项理解到赛后复盘，<br />让每一步训练都有依据。</h1>
          <p>围绕评分标准组织任务、诊断作品证据并开展模拟答辩，为教师和学生提供可追踪的备赛闭环。</p>
        </div>
        <div className="login-flow" aria-label="六阶段备赛流程">
          {['赛项理解', '方案设计', '原型开发', '作品打磨', '模拟答辩', '赛后复盘'].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <header><span>欢迎使用</span><h2>登录赛训智舱</h2><p>{DEMO_MODE ? "演示模式：未连接后端，请使用测试账号" : "使用指导教师测试账号进入系统"}</p></header>
          <label><span>账号</span><div className="login-input"><User size={20} /><input aria-label="账号" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></div></label>
          <label><span>密码</span><div className="login-input"><LockKey size={20} /><input aria-label="密码" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}</button></div></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={submitting}><SignIn size={22} weight="bold" />{submitting ? "正在登录…" : "进入系统"}</button>
        </form>
      </section>
    </main>
  );
}
