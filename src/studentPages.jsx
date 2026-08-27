import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Brain, CheckCircle, CloudArrowUp, MonitorPlay, SealCheck, Student,
} from "@phosphor-icons/react";
import { api, DEMO_MODE } from "./api.js";

const severityTone = (s) => ({ LOW: "green", MEDIUM: "blue", HIGH: "orange", CRITICAL: "red" }[s] || "blue");
const severityLabel = (s) => ({ LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "严重" }[s] || s);

function PageIntro({ icon: Icon, title, description }) {
  return (
    <header className="page-intro">
      <span className="page-icon"><Icon size={25} weight="duotone" /></span>
      <div><h1>{title}</h1><p>{description}</p></div>
    </header>
  );
}

const demoTasks = [
  { id: "d1", title: "补充应用成效对比数据", status: "NEEDS_FIX", done: false, dueDate: "2026-08-25", owner: { name: "我" } },
  { id: "d2", title: "完善统计口径说明", status: "TODO", done: false, dueDate: "2026-08-26", owner: { name: "我" } },
  { id: "d3", title: "整理应用场景与价值说明", status: "DONE", done: true, dueDate: "2026-08-22", owner: { name: "我" } },
];
const demoWorks = [
  { id: "w1", version: 1, project: { name: "AI应用开发赛" }, uploader: { name: "我" }, createdAt: "2026-08-23T10:00:00Z" },
];
const demoDiagnosis = [
  { id: "x1", workVersion: { id: "w1", version: 1, project: { name: "AI应用开发赛" } }, scorePoint: { criterion: { name: "应用成效" }, name: "前后对比" }, matchScore: 58, severity: "HIGH", issues: "缺少优化前后的核心指标对比数据。", suggestions: "补充前后对比指标与图表，提升达成度。" },
  { id: "x2", workVersion: { id: "w1", version: 1, project: { name: "AI应用开发赛" } }, scorePoint: { criterion: { name: "应用成效" }, name: "统计口径" }, matchScore: 72, severity: "MEDIUM", issues: "统计口径说明可更明确。", suggestions: "明确统计对象与数据来源。" },
];
const demoSession = {
  id: "demo-session",
  transcript: [
    { role: "judge", content: "请简要说明你的作品是如何理解并落实赛项需求的？" },
    { role: "student", content: "我们围绕应用成效维度，补充了前后对比数据与统计口径说明。", evaluation: { logic: 82, evidence: 70, accuracy: 78 } },
    { role: "judge", content: "作品中核心技术实现的关键难点是什么，你是如何解决的？" },
  ],
  evaluations: { done: false, maxRounds: 3, rounds: [{ logic: 82, evidence: 70, accuracy: 78 }] },
};

// ---------- 我的任务 ----------
export function StudentTasksPage({ projectId, onToast }) {
  const [tasks, setTasks] = useState(DEMO_MODE ? demoTasks : []);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (DEMO_MODE || !projectId) return undefined;
    let active = true;
    setLoading(true);
    api.tasks.list(projectId).then((list) => { if (active) setTasks(Array.isArray(list) ? list : []); })
      .catch((err) => { if (active) onToast(err?.message || "任务加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);
  return (
    <section className="module-page">
      <PageIntro icon={Student} title="我的任务" description="查看指导教师为团队布置的训练任务与修改任务（只读）。" />
      <div className="student-card">
        {!projectId && <p className="empty-hint">请先在顶部选择赛项查看对应任务。</p>}
        {projectId && tasks.length === 0 && !loading && <p className="empty-hint">当前赛项暂无任务。</p>}
        <ul className="task-feed">
          {tasks.map((t) => (
            <li key={t.id} className={"feed-row " + (t.done ? "done" : "")}>
              <CheckCircle size={18} weight={t.done ? "fill" : "regular"} className={t.done ? "ok" : "muted"} />
              <div className="feed-main">
                <strong>{t.title}</strong>
                <span className="feed-meta">
                  {t.status === "NEEDS_FIX" ? "修改任务" : "训练任务"}
                  {t.dueDate ? " · 截止 " + String(t.dueDate || "").slice(0, 10) : ""}
                  {t.owner ? " · 负责人 " + (t.owner?.name || t.owner) : ""}
                </span>
              </div>
              <span className={"priority " + (t.status === "DONE" ? "complete" : t.status === "NEEDS_FIX" ? "high" : "medium")}>
                {t.done ? "已完成" : t.status === "NEEDS_FIX" ? "待修改" : "进行中"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- 我的作品 ----------
export function StudentWorksPage({ projectId, onToast, onNavigate }) {
  const [works, setWorks] = useState(DEMO_MODE ? demoWorks : []);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (DEMO_MODE) return undefined;
    let active = true;
    setLoading(true);
    api.works.mine().then((list) => { if (active) setWorks(Array.isArray(list) ? list : []); })
      .catch((err) => { if (active) onToast(err?.message || "作品加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  };
  useEffect(load, []);

  const upload = async () => {
    if (DEMO_MODE) { onToast("演示模式：未连接后端，无法上传"); return; }
    if (!projectId) { onToast("请先在顶部选择一个赛项再上传作品"); return; }
    if (!file) { onToast("请选择要上传的作品文件"); return; }
    setSubmitting(true);
    try {
      await api.works.upload(projectId, file);
      onToast("作品已提交，可前往「诊断反馈」发起诊断");
      setFile(null);
      load();
    } catch (err) { onToast(err?.message || "上传失败"); }
    finally { setSubmitting(false); }
  };

  const diagnose = async (workId) => {
    if (DEMO_MODE) { onNavigate("诊断反馈"); return; }
    try {
      await api.diagnosis.analyze(workId);
      onToast("已对该作品发起诊断，结果见「诊断反馈」");
      onNavigate("诊断反馈");
    } catch (err) { onToast(err?.message || "诊断发起失败"); }
  };

  return (
    <section className="module-page">
      <PageIntro icon={CloudArrowUp} title="我的作品" description="提交你的赛项作品，并针对作品发起 AI 诊断。" />
      <div className="student-card">
        <div className="upload-bar">
          <span className="upload-project">当前赛项：<strong>{projectId ? "已选择" : "未选择（请在顶部选择）"}</strong></span>
          <input type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} aria-label="选择作品文件" />
          <button className="page-primary" onClick={upload} disabled={submitting}>{submitting ? "提交中…" : "上传作品"}</button>
        </div>
        {works.length === 0 && !loading && <p className="empty-hint">你还没有提交过作品。选择赛项后上传第一份作品吧。</p>}
        <ul className="work-feed">
          {works.map((w) => (
            <li key={w.id} className="feed-row">
              <CloudArrowUp size={18} className="muted" />
              <div className="feed-main">
                <strong>{(w.project && w.project.name) || "赛项"} · 第 {w.version} 版</strong>
                <span className="feed-meta">提交人 {(w.uploader && w.uploader.name) || "我"} · {String(w.createdAt || "").slice(0, 10)}</span>
              </div>
              <button className="link-button" onClick={() => diagnose(w.id)}>发起诊断<ArrowRight size={14} /></button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- 诊断反馈 ----------
export function StudentDiagnosisPage({ onToast }) {
  const [rows, setRows] = useState(DEMO_MODE ? demoDiagnosis : []);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (DEMO_MODE) return undefined;
    let active = true;
    setLoading(true);
    api.diagnosis.mine().then((list) => { if (active) setRows(Array.isArray(list) ? list : []); })
      .catch((err) => { if (active) onToast(err?.message || "诊断加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of rows) {
      const key = (d.workVersion && d.workVersion.id) || d.workVersionId;
      if (!map.has(key)) map.set(key, { work: d.workVersion, items: [] });
      map.get(key).items.push(d);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <section className="module-page">
      <PageIntro icon={Brain} title="诊断反馈" description="查看 AI 对你提交作品的逐项评分与改进建议。" />
      <div className="student-card">
        {rows.length === 0 && !loading && <p className="empty-hint">暂无诊断结果。请先在「我的作品」中发起诊断。</p>}
        {groups.map((g, gi) => {
          const avg = g.items.length ? Math.round(g.items.reduce((s, x) => s + (x.matchScore || 0), 0) / g.items.length) : 0;
          return (
            <div className="diag-group" key={gi}>
              <div className="diag-group-head">
                <strong>{(g.work && g.work.project && g.work.project.name) || "赛项"} · 第 {(g.work && g.work.version) || "?"} 版</strong>
                <span className="avg-score">平均达成度 {avg}</span>
              </div>
              <ul className="diag-list">
                {g.items.map((d) => (
                  <li key={d.id} className="diag-item">
                    <div className="diag-item-head">
                      <span className="crit-name">{(d.scorePoint && d.scorePoint.criterion && d.scorePoint.criterion.name) || ""} · {(d.scorePoint && d.scorePoint.name) || ""}</span>
                      <span className={"status-tag " + severityTone(d.severity)}>匹配 {d.matchScore} · {severityLabel(d.severity)}</span>
                    </div>
                    <p className="diag-issues">不足：{d.issues}</p>
                    <p className="diag-suggest">建议：{d.suggestions}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 模拟答辩 ----------
export function StudentDefensePage({ projectId, onToast }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(DEMO_MODE ? demoSession : null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = () => {
    if (DEMO_MODE || !projectId) return;
    api.defense.list(projectId).then((list) => setSessions(Array.isArray(list) ? list : [])).catch(() => {});
  };
  useEffect(loadList, [projectId]);

  const start = async () => {
    if (DEMO_MODE) { onToast("演示模式：未连接后端"); return; }
    if (!projectId) { onToast("请先在顶部选择赛项"); return; }
    setBusy(true);
    try {
      const s = await api.defense.create(projectId, 3);
      setSelected(s);
      loadList();
      onToast("模拟答辩已发起");
    } catch (err) { onToast(err?.message || "发起失败"); }
    finally { setBusy(false); }
  };

  const submitAnswer = async () => {
    if (DEMO_MODE) { onToast("演示模式：未连接后端"); return; }
    if (!selected || !selected.id || !answer.trim()) { onToast("请填写作答内容"); return; }
    setBusy(true);
    try {
      const updated = await api.defense.answer(selected.id, answer);
      setSelected(updated);
      setAnswer("");
      onToast("作答已提交");
    } catch (err) { onToast(err?.message || "提交失败"); }
    finally { setBusy(false); }
  };

  const transcript = (selected && selected.transcript) || [];
  const evaluations = (selected && selected.evaluations) || {};

  return (
    <section className="module-page">
      <PageIntro icon={MonitorPlay} title="模拟答辩" description="与 AI 评委展开多轮模拟答辩，获得逻辑、证据与准确性的评分反馈。" />
      <div className="student-card">
        <div className="defense-bar">
          <button className="page-primary" onClick={start} disabled={busy}>{DEMO_MODE ? "演示：发起模拟答辩" : "发起模拟答辩"}</button>
          {sessions.length > 0 && !DEMO_MODE && (
            <select value={selected && selected.id ? selected.id : ""} onChange={(e) => {
              const s = sessions.find((x) => x.id === e.target.value);
              if (s) setSelected(s);
            }} aria-label="选择答辩">
              {sessions.map((s) => <option key={s.id} value={s.id}>答辩会话 {String(s.id).slice(-4)}</option>)}
            </select>
          )}
        </div>
        {!selected && <p className="empty-hint">点击「发起模拟答辩」开始你的第一场模拟答辩。</p>}
        {selected && (
          <div className="defense-room">
            <ul className="transcript">
              {transcript.map((t, i) => (
                <li key={i} className={"turn " + t.role}>
                  <span className="turn-role">{t.role === "judge" ? "评委" : "我"}</span>
                  <div className="turn-body">
                    <p>{t.content}</p>
                    {t.evaluation && (
                      <div className="turn-score">
                        <span>逻辑 {t.evaluation.logic}</span><span>证据 {t.evaluation.evidence}</span><span>准确 {t.evaluation.accuracy}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {evaluations && evaluations.done ? (
              <div className="defense-summary"><SealCheck size={20} /><strong>总评</strong><p>{evaluations.overall}</p></div>
            ) : (
              <div className="answer-box">
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="输入你的作答…" rows={3} />
                <button className="page-primary" onClick={submitAnswer} disabled={busy}>提交作答</button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
