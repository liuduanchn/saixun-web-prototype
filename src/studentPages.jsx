import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Brain, CheckCircle, CloudArrowUp, Microphone, MonitorPlay, SealCheck, Student,
} from "@phosphor-icons/react";
import { api, DEMO_MODE, PROJECT_ID } from "./api.js";
// 演示模式共享上下文：与教师端 demo 项目 / 人员保持一致
const DEMO_PROJECT_NAME = "AI应用开发赛";
const DEMO_STUDENT = "王同学";
import { recordingToWav } from "./audio.js";
import { unwrapList } from "./shape.js";

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
  { id: "d1", title: "补充应用成效对比数据", status: "NEEDS_FIX", done: false, dueDate: "2026-08-25", owner: { name: DEMO_STUDENT } },
  { id: "d2", title: "完善统计口径说明", status: "TODO", done: false, dueDate: "2026-08-26", owner: { name: DEMO_STUDENT } },
  { id: "d3", title: "整理应用场景与价值说明", status: "DONE", done: true, dueDate: "2026-08-22", owner: { name: DEMO_STUDENT } },
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
    api.tasks.list(projectId).then((list) => { if (active) setTasks(unwrapList(list)); })
      .catch((err) => { if (active) onToast(err?.message || "任务加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);
  return (
    <section className="module-page">
      <PageIntro icon={Student} title="我的任务" description="查看指导教师为团队布置的训练任务与修改任务（只读）。" />
      <div className="student-card">
        {!projectId && !DEMO_MODE && <p className="empty-hint">请先在顶部选择赛项查看对应任务。</p>}
        {projectId && tasks.length === 0 && !loading && !DEMO_MODE && <p className="empty-hint">当前赛项暂无任务。</p>}
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
    api.works.mine().then((list) => { if (active) setWorks(unwrapList(list)); })
      .catch((err) => { if (active) onToast(err?.message || "作品加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  };
  useEffect(load, []);

  const upload = async () => {
    if (DEMO_MODE) {
      setWorks((list) => [{ id: "demo-w-" + Date.now(), version: list.length + 1, project: { name: DEMO_PROJECT_NAME }, uploader: { name: DEMO_STUDENT }, createdAt: new Date().toISOString() }, ...list]);
      onToast("作品已提交（演示）");
      setFile(null);
      return;
    }
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
          <span className="upload-project">当前赛项：<strong>{DEMO_MODE ? DEMO_PROJECT_NAME : (projectId ? "已选择" : "未选择（请在顶部选择）")}</strong></span>
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
    api.diagnosis.mine().then((list) => { if (active) setRows(unwrapList(list)); })
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
  const [recording, setRecording] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const loadList = () => {
    if (DEMO_MODE || !projectId) return;
    api.defense.list(projectId).then((list) => setSessions(unwrapList(list))).catch(() => {});
  };
  useEffect(loadList, [projectId]);

  const start = async () => {
    if (DEMO_MODE) {
      setSelected({
        id: "demo-session-" + Date.now(),
        transcript: [{ role: "judge", content: "请简要说明你的作品是如何理解并落实赛项需求的？" }],
        evaluations: { done: false, maxRounds: 3, rounds: [] },
      });
      onToast("已进入演示答辩（演示模式）");
      return;
    }
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
    if (!selected || !answer.trim()) { onToast("请填写作答内容"); return; }
    if (DEMO_MODE) {
      const studentTurn = { role: "student", content: answer, evaluation: { logic: 80, evidence: 70, accuracy: 78 } };
      const judgeTurn = { role: "judge", content: "请进一步说明作品的应用成效与可量化价值体现。" };
      setSelected((prev) => ({
        ...prev,
        transcript: [...(prev.transcript || []), studentTurn, judgeTurn],
        evaluations: {
          ...prev.evaluations,
          rounds: [...(prev.evaluations?.rounds || []), { logic: 80, evidence: 70, accuracy: 78 }],
        },
      }));
      setAnswer("");
      onToast("作答已提交（演示）");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.defense.answer(selected.id, answer);
      setSelected(updated);
      setAnswer("");
      onToast("作答已提交");
    } catch (err) { onToast(err?.message || "提交失败"); }
    finally { setBusy(false); }
  };

  // 录音并转写：复用教师端同一套 MediaRecorder + WAV 转码 + 线上 ASR 逻辑
  const startRecording = async () => {
    if (DEMO_MODE) { onToast("演示模式：语音输入需连接后端并在设置中心配置 ASR"); return; }
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const rawBlob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!rawBlob.size) { onToast("录音为空，请重试"); return; }
        try {
          setRecognizing(true);
          const wavBlob = await recordingToWav(rawBlob);
          const data = await Promise.race([
            api.speech.transcribe(wavBlob),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("语音识别超时，请稍后重试")), 75000),
            ),
          ]);
          setAnswer((prev) => (prev && prev.trim() ? `${prev}\n${data.transcript}` : data.transcript));
          onToast("语音已转为文字并填入作答");
        } catch (e) {
          onToast(e?.message || "语音识别失败");
        } finally {
          setRecognizing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      onToast("无法访问麦克风：" + (e?.message || e));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
    }
  };

  const transcript = (selected && selected.transcript) || [];
  const evaluations = (selected && selected.evaluations) || {};

  return (
    <section className="module-page">
      <PageIntro icon={MonitorPlay} title="模拟答辩" description="与 AI 评委展开多轮模拟答辩，获得逻辑、证据与准确性的评分反馈。" />
      <div className="student-card">
        <div className="defense-bar">
          <span className="upload-project">当前赛项：<strong>{DEMO_MODE ? DEMO_PROJECT_NAME : (projectId ? "已选择" : "未选择")}</strong></span>
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
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="输入你的作答…（也可点击麦克风语音输入）" rows={3} />
                <div className="parse-actions">
                  <button className={`page-primary ${recording ? "recording" : ""}`} onClick={recording ? stopRecording : startRecording} disabled={recognizing}>
                    <Microphone size={17} />{recording ? "停止录音" : (recognizing ? "识别中…" : "语音输入")}
                  </button>
                  <button className="page-primary" onClick={submitAnswer} disabled={busy || recognizing}>{busy ? "提交中…" : "提交作答"}</button>
                </div>
                {recording && <p className="recording-hint">录音中…点击「停止录音」结束并自动转写为文字。</p>}
                {recognizing && <p className="recording-hint">语音识别中…识别完成会自动填入上方作答框，请稍候。</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
