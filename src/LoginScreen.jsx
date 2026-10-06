import { useState } from "react";
import { ArrowUpRight, Eye, EyeSlash, LockKey, SignIn, User } from "@phosphor-icons/react";
import { DEMO_MODE } from "./api.js";
import { performLogin } from "./loginFlow.js";
import { BrandLogo } from "./BrandLogo.jsx";

// 新版落地页是多页入口（vite.config.js 的第二个 HTML 入口），随 base 变化。
const LANDING_HREF = `${import.meta.env.BASE_URL}landing.html`;

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    // 登录逻辑与新版落地页共用同一份实现（src/loginFlow.js）
    const result = await performLogin(username, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onLogin(result.user);
  };

  return (
    <main className="login-screen">
      <a className="login-newentry" href={LANDING_HREF}>
        <ArrowUpRight size={17} weight="bold" />新版入口
      </a>

      <section className="login-story" aria-label="赛训智舱产品介绍">
        {/* 登录页底色本身就是深蓝，无需 logo 自带的深紫容器；去掉容器让图形撑满 42px 格，
            否则容器会把可见图形缩到约 22px，环在深底上偏弱。 */}
        <div className="login-brand"><span><BrandLogo size={42} plate={false} /></span><strong>赛训智舱</strong><small>让备赛有标准，让答辩有底气</small></div>
        <div className="login-story-copy">
          <span className="login-eyebrow">岗课赛证融通智能体 · 竞赛训练场景</span>
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
