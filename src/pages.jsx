import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpenText, Brain, CalendarBlank, ChartBar, Check, CheckCircle,
  ClipboardText, Clock, CloudArrowUp, Cube, FileDoc, FilePdf, FileXls, Flag,
  FolderOpen, GearSix, GraduationCap, Lightbulb, MagnifyingGlass, Medal,
  MonitorPlay, PaperPlaneTilt, Plus, PresentationChart, SealCheck, ShieldCheck,
  Sparkle, Student, Target, TrendUp, UserCircle, UsersThree, WarningCircle, X,
} from "@phosphor-icons/react";
import { api, DEMO_MODE, PROJECT_ID } from "./api.js";
import { normalizeTask, buildColumns } from "./taskModel.js";

const criteria = [
  { name: "功能完整性", weight: "25%", points: ["需求理解与功能覆盖", "核心功能实现规范性", "功能稳定性与鲁棒性"], tone: "blue" },
  { name: "技术路线", weight: "20%", points: ["技术选型合理性", "架构设计先进性", "关键技术应用正确性"], tone: "cyan" },
  { name: "创新价值", weight: "20%", points: ["创新点明确性", "方案独特性与亮点", "技术创新性"], tone: "violet" },
  { name: "应用成效", weight: "20%", points: ["应用效果与性能表现", "实际应用价值", "效益与影响力"], tone: "orange" },
  { name: "展示表达", weight: "15%", points: ["文档完整性与规范性", "展示逻辑与表达清晰度", "答辩沟通表现"], tone: "blue" },
];

const board = [
  { title: "待开始", tone: "neutral", items: ["确认评分点", "完善技术路线"] },
  { title: "进行中", tone: "blue", items: ["补充测试记录", "优化演示脚本"] },
  { title: "待审核", tone: "cyan", items: ["提交作品原型"] },
  { title: "需修改", tone: "orange", items: ["应用成效分析"] },
  { title: "已完成", tone: "green", items: ["完成模拟答辩", "完善作品文档"] },
];

// 看板列标题 -> 后端任务状态
const COLUMN_STATUS = {
  待开始: "TODO",
  进行中: "IN_PROGRESS",
  待审核: "IN_REVIEW",
  需修改: "NEEDS_FIX",
  已完成: "DONE",
};
const statusKeyOf = (label) => COLUMN_STATUS[label] || "TODO";

function PageIntro({ icon: Icon, title, description, action }) {
  return <header className="page-intro"><span className="page-icon"><Icon size={25} weight="duotone" /></span><div><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function StatusTag({ children, tone = "blue" }) {
  return <span className={`status-tag ${tone}`}>{children}</span>;
}

function AnalysisPage({ onNavigate, onToast }) {
  const [list, setList] = useState(DEMO_MODE ? criteria : []);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO_MODE) { setList(criteria); return; }
    let alive = true;
    setLoading(true);
    api.criteria.list(PROJECT_ID)
      .then((data) => { if (alive) setList(data); })
      .catch(() => { if (alive) onToast("评分标准加载失败"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [onToast]);

  const pointsOf = (c) => (DEMO_MODE ? c.points : c.scorePoints.map((sp) => sp.name));

  const handleParse = async () => {
    if (!text.trim()) { onToast("请先粘贴赛项规程或评分标准文本"); return; }
    setBusy(true);
    try {
      const { draft } = await api.criteria.parse(text);
      setDraft(draft);
    } catch (e) {
      onToast(e.message || "解析失败");
    } finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api.criteria.confirm(PROJECT_ID, draft);
      const data = await api.criteria.list(PROJECT_ID);
      setList(data);
      setDraft(null); setText("");
      onToast("评分要素已确认并加入训练路线");
      if (onNavigate) onNavigate("训练任务中心");
    } catch (e) { onToast(e.message || "确认失败"); }
    finally { setBusy(false); }
  };

  const handleRemove = async (id) => {
    try {
      await api.criteria.remove(id);
      setList((l) => l.filter((c) => c.id !== id));
      onToast("已删除评分要素");
    } catch (e) { onToast(e.message || "删除失败"); }
  };

  const totalPoints = list.reduce((sum, c) => sum + pointsOf(c).length, 0);

  return <section className="module-page">
    <PageIntro icon={Cube} title="赛项解析中心" description="解析赛项规程与评分标准，由智能体抽取评分要素与能力要求，教师确认后生成训练路线。" action={!DEMO_MODE && <button className="page-primary" onClick={() => onNavigate("训练任务中心")}><PaperPlaneTilt size={19} />查看训练路线</button>} />
    <div className="process-strip">{[[FileDoc,"赛项规程","粘贴规程/评分标准文本"],[ChartBar,"评分标准 → 能力点解析","智能体抽取评分要素与权重"],[ShieldCheck,"教师确认","确认后生成训练路线"]].map(([Icon,title,desc], index) => <div key={title}><span><Icon size={25} weight="duotone" /></span><p><strong>{title}</strong><small>{desc}</small></p>{index < 2 && <ArrowRight size={22} />}</div>)}</div>

    {!DEMO_MODE && (
      <section className="module-panel parse-panel">
        <div className="panel-title"><h2>赛项规程解析（LLM）</h2>{busy && <StatusTag tone="blue">处理中…</StatusTag>}</div>
        <textarea aria-label="赛项规程文本" value={text} onChange={(e) => setText(e.target.value)} placeholder="在此粘贴赛项规程、评分标准或能力要求文本，智能体将自动抽取结构化评分要素……" />
        <div className="parse-actions">
          <button className="page-primary" onClick={handleParse} disabled={busy}><Sparkle size={18} />AI 解析评分要素</button>
          {draft && <button className="secondary-button" onClick={() => setDraft(null)} disabled={busy}>清除草稿</button>}
        </div>
        {draft && (
          <div className="draft-box">
            <h3>解析草稿（请核对后确认）</h3>
            {draft.map((c, i) => <article className="criterion-row" key={i}><div className="criterion-weight blue"><strong>{c.name}</strong><span>{c.weight}%</span></div><ul>{c.scorePoints.map((sp, j) => <li key={j}>{sp.name}{sp.abilityTags?.length ? <em>（{sp.abilityTags.join("、")}）</em> : null}</li>)}</ul></article>)}
            <div className="parse-actions">
              <button className="page-primary" onClick={handleConfirm} disabled={busy}><SealCheck size={18} />确认并加入评分标准</button>
              <button className="secondary-button" onClick={() => setDraft(null)} disabled={busy}>暂不确认</button>
            </div>
          </div>
        )}
      </section>
    )}

    <div className="analysis-layout">
      <section className="module-panel criteria-panel"><div className="panel-title"><h2>评分要素与能力映射</h2><span>{loading ? "加载中…" : `共 ${totalPoints} 个关键评分点`}</span></div>{list.length === 0 && !loading && <p className="empty-state">{DEMO_MODE ? "暂无评分要素" : "尚无评分要素，请在上方粘贴赛项规程进行解析"}</p>}{list.map((item) => <article className="criterion-row" key={item.id || item.name}><div className={`criterion-weight ${(item.tone) || "blue"}`}><strong>{item.name}</strong><span>{DEMO_MODE ? item.weight : `${item.weight}%`}</span></div><ul>{pointsOf(item).map((point) => <li key={point}>{point}</li>)}</ul></article>)}</section>
      <aside className="module-panel confirm-panel"><div className="panel-title"><h2>评分要点确认</h2><StatusTag tone="green">{list.length} 要素</StatusTag></div><div className="metric-trio"><span><strong>{list.length}</strong><small>评分要素</small></span><span><strong>{totalPoints}</strong><small>关键评分点</small></span><span><strong>{DEMO_MODE ? "演示" : "已确认"}</strong><small>状态</small></span></div>{list.map((item) => <div className="confirm-row" key={item.id || item.name}><CheckCircle size={18} weight="fill" /><span>{item.name}（{DEMO_MODE ? item.weight : `${item.weight}%`}）</span>{!DEMO_MODE && <button aria-label="删除" onClick={() => handleRemove(item.id)}><X size={15} /></button>}</div>)}</aside>
    </div>
  </section>;
}

function TrainingPage({ onToast }) {
  const [tasks, setTasks] = useState(DEMO_MODE ? null : []);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState("");

  useEffect(() => {
    if (DEMO_MODE) return undefined;
    let active = true;
    const load = async () => {
      try {
        const [list, cov] = await Promise.all([
          api.tasks.list(PROJECT_ID),
          api.tasks.coverage(PROJECT_ID),
        ]);
        if (!active) return;
        setTasks(list.map(normalizeTask));
        setCoverage(cov);
      } catch (err) {
        if (active) setError(err?.message || "任务数据加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const createTask = async (status) => {
    const title = window.prompt("请输入任务标题");
    if (!title || !title.trim()) return;
    if (DEMO_MODE) {
      onToast("演示模式：新建任务仅本地展示，不会写入后端");
      return;
    }
    try {
      const created = await api.tasks.create({ projectId: PROJECT_ID, title: title.trim(), status });
      setTasks((cur) => [normalizeTask(created), ...cur]);
      onToast("任务已创建");
    } catch (err) {
      onToast(err?.message || "创建失败");
    }
  };

  const toggleDone = async (item) => {
    const next = item.status === "DONE" ? "TODO" : "DONE";
    if (DEMO_MODE) {
      setTasks((cur) => cur.map((t) => (t.id === item.id ? { ...t, status: next, done: next === "DONE" } : t)));
      return;
    }
    try {
      const updated = await api.tasks.update(item.id, { status: next });
      setTasks((cur) => cur.map((t) => (t.id === item.id ? normalizeTask(updated) : t)));
    } catch (err) {
      onToast(err?.message || "更新失败");
    }
  };

  const removeTask = async (item) => {
    if (DEMO_MODE) {
      setTasks((cur) => cur.filter((t) => t.id !== item.id));
      return;
    }
    try {
      await api.tasks.remove(item.id);
      setTasks((cur) => cur.filter((t) => t.id !== item.id));
      onToast("任务已删除");
    } catch (err) {
      onToast(err?.message || "删除失败");
    }
  };

  const columns = (() => {
    if (DEMO_MODE || !tasks) {
      return board.map((col) => ({
        ...col,
        items: col.items.map((title, i) => ({
          id: `${col.title}-${i}`,
          title,
          scorePointCount: i % 2 ? 3 : 5,
          due: col.tone === "green" ? "已完成" : "截止 08-28 18:00",
          status: col.tone === "green" ? "DONE" : col.tone === "orange" ? "NEEDS_FIX" : "IN_PROGRESS",
          done: col.tone === "green",
        })),
      }));
    }
    return buildColumns(tasks).map((col) => ({
      ...col,
      items: col.items.map((t) => ({
        id: t.id,
        title: t.title,
        scorePointCount: t.scorePoints.length,
        due: t.due,
        status: t.status,
        done: t.done,
      })),
    }));
  })();

  const covCovered = coverage ? coverage.coveredScorePoints : 18;
  const covTotal = coverage ? coverage.totalScorePoints : 25;
  const covRate = coverage ? coverage.coverageRate : 72;

  return <section className="module-page">
    <PageIntro icon={ClipboardText} title="训练任务中心" description="将能力要求转化为阶段任务，持续跟踪进度、审核状态与评分覆盖。" action={<button className="page-primary" onClick={() => createTask("TODO")}><Plus size={19} />新建任务</button>} />
    <div className="stage-compact">{['赛项理解','方案设计','原型开发','作品打磨','模拟答辩','赛后复盘'].map((item,index) => <span key={item} className={index === 3 ? 'active' : ''}><i>{index + 1}</i>{item}</span>)}</div>
    {error && <p className="empty-state">{error}</p>}
    {loading && <p className="empty-state">任务加载中…</p>}
    <div className="board-layout"><div className="kanban-board">{columns.map((column) => <section className={`kanban-column ${column.tone}`} key={column.label}><header><h2>{column.label}</h2><span>{column.items.length}</span></header>{column.items.map((item) => <article className={`kanban-card ${item.done ? "done" : ""}`} key={item.id}>
      <button className="kanban-card-main" onClick={() => toggleDone(item)}><strong>{item.title}</strong><p>关联 {item.scorePointCount} 个评分点</p><small><Clock size={14} />{item.due}</small></button>
      <button className="kanban-del" aria-label="删除任务" onClick={(event) => { event.stopPropagation(); removeTask(item); }}><X size={15} /></button>
    </article>)}<button className="add-task" onClick={() => createTask(statusKeyOf(column.label))}><Plus size={16} />新建任务</button></section>)}</div><aside className="board-summary"><section className="module-panel"><h2>评分点覆盖</h2><div className="coverage-big"><strong>{covCovered}</strong><span>/{covTotal}</span></div><div className="progress-line"><i style={{ width: `${covRate}%` }} /></div><p><span>已覆盖 {covCovered}</span><span>未覆盖 {covTotal - covCovered}</span></p></section><section className="module-panel warning-box"><h2><WarningCircle size={21} />风险预警</h2><strong>展示材料缺少应用成效证据</strong><p>可能影响“应用成效”评分点得分。</p><button onClick={() => onToast("已定位到应用成效修改任务")}>去处理<ArrowRight size={15} /></button></section></aside></div>
  </section>;
}

const severityTone = (s) => ({ LOW: "green", MEDIUM: "blue", HIGH: "orange", CRITICAL: "red" }[s] || "blue");
const severityLabel = (s) => ({ LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "严重" }[s] || s);
function normalizeDiagnosis(d) {
  return {
    id: d.id,
    name: d.scorePoint?.name ?? "评分点",
    criterion: d.scorePoint?.criterion?.name ?? "",
    matchScore: d.matchScore,
    severity: d.severity,
    issues: d.issues,
    suggestions: d.suggestions,
    status: d.status,
  };
}

function DiagnosisPage({ onNavigate, onOpenDiagnosis, onToast }) {
  const [version, setVersion] = useState(null);
  const [findings, setFindings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (DEMO_MODE) {
    return <section className="module-page">
      <PageIntro icon={MonitorPlay} title="作品诊断中心" description="对照评分标准核验作品证据，由智能体提出问题、影响和修改建议。" action={<button className="page-primary" onClick={onOpenDiagnosis}><MagnifyingGlass size={19} />查看证据缺口</button>} />
      <div className="diagnosis-grid"><section className="diagnosis-source"><article className="module-panel"><h2><FileDoc size={22} />评分标准原文</h2><p><strong>应用成效（20%）</strong></p><p>参赛作品应提供可量化的应用成效，<mark>包含测试样本、统计口径、前后对比和实际应用价值</mark>，并能验证实际改进。</p></article><article className="module-panel"><h2><ClipboardText size={22} />作品材料原文</h2><p><strong>应用成效</strong></p><p>本作品在实际场景中应用后，<mark>系统效率有所提升</mark>，用户体验得到改善，取得了良好的效果。</p></article></section><section className="module-panel diagnosis-result"><h2><Brain size={24} />智能诊断</h2><div className="match-score"><span><strong>92%</strong><small>证据匹配度</small></span><StatusTag tone="red">严重</StatusTag></div><dl><div><dt>主要问题</dt><dd>缺少可核验的应用成效数据</dd></div><div><dt>影响评分</dt><dd>应用成效</dd></div><div><dt>修改建议</dt><dd>补充测试样本、统计口径和前后对比</dd></div></dl></section><aside className="module-panel teacher-review"><h2><SealCheck size={24} />教师复核</h2><div className="review-confirm"><Check size={56} weight="bold" /><strong>待确认</strong></div><div className="review-actions"><button onClick={() => onToast("诊断建议已确认")}><CheckCircle size={19} />确认</button><button onClick={() => onToast("已退回智能体重新诊断")}><WarningCircle size={19} />驳回</button></div><button className="page-primary" onClick={() => onNavigate("训练任务中心")}><ClipboardText size={19} />转为修改任务</button></aside></div>
    </section>;
  }

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const wv = await api.works.upload(PROJECT_ID, file);
      setVersion({ id: wv.id, version: wv.version });
      const list = await api.diagnosis.analyze(wv.id);
      setFindings(list.map(normalizeDiagnosis));
      onToast("作品已上传并完成智能诊断");
    } catch (err) {
      setError(err?.message || "上传或诊断失败");
    } finally {
      setBusy(false);
    }
  };

  const review = async (diag, status) => {
    if (!version) return;
    setBusy(true);
    try {
      const res = await api.diagnosis.review(diag.id, status);
      const list = await api.diagnosis.list(version.id);
      setFindings(list.map(normalizeDiagnosis));
      if (res.createdTask) onToast(`已生成修改任务：${res.createdTask.title}`);
      else onToast(status === "CONFIRMED" ? "诊断项已确认" : "诊断项已驳回");
    } catch (err) {
      setError(err?.message || "复核失败");
    } finally {
      setBusy(false);
    }
  };

  const criterionCount = findings.length ? new Set(findings.map((f) => f.criterion)).size : 0;

  return <section className="module-page">
    <PageIntro icon={MonitorPlay} title="作品诊断中心" description="上传作品并由智能体对照评分标准逐项诊断，输出匹配度、问题与修改建议。" action={<label className="page-primary upload-label"><CloudArrowUp size={19} />{busy ? "处理中…" : "上传作品"}<input type="file" hidden onChange={onFile} disabled={busy} /></label>} />
    {error && <p className="empty-state">{error}</p>}
    {!version && <p className="empty-state">尚未上传作品。点击右上角“上传作品”开始诊断（文本类材料如 .txt/.md 可被解析并对照评分点）。</p>}
    {version && <div className="diagnosis-meta">当前作品：第 {version.version} 版 · 共 {findings.length} 条诊断 · 覆盖 {criterionCount} 个评分要素</div>}
    <div className="diagnosis-grid">
      <section className="diagnosis-source">
        <article className="module-panel"><h2><FileDoc size={22} />评分标准</h2><p>诊断依据为赛项已配置的评分点（共 {criterionCount} 个评分要素）。</p></article>
        {version && <article className="module-panel"><h2><ClipboardText size={22} />当前作品</h2><p>第 {version.version} 版作品已上传，正在对照评分标准进行智能诊断。</p></article>}
      </section>
      <section className="module-panel diagnosis-result"><h2><Brain size={24} />智能诊断结果</h2>
        {findings.length === 0 && <p className="empty-state">暂无诊断结果。</p>}
        <div className="diagnosis-list">
          {findings.map((f) => <article className="diagnosis-item" key={f.id}>
            <div className="diagnosis-item-head"><strong>{f.name}</strong><StatusTag tone={severityTone(f.severity)}>{severityLabel(f.severity)}</StatusTag></div>
            <div className="match-score"><span><strong>{f.matchScore}%</strong><small>证据匹配度</small></span></div>
            <dl><div><dt>主要问题</dt><dd>{f.issues}</dd></div><div><dt>修改建议</dt><dd>{f.suggestions}</dd></div></dl>
            <div className="diagnosis-actions">
              <button onClick={() => review(f, "CONFIRMED")} disabled={busy || f.status === "CONFIRMED"}><CheckCircle size={18} />确认</button>
              <button onClick={() => review(f, "REJECTED")} disabled={busy || f.status === "REJECTED"}><WarningCircle size={18} />驳回</button>
              {f.status === "CONFIRMED" && <span className="review-state confirmed">已确认</span>}
              {f.status === "REJECTED" && <span className="review-state rejected">已驳回</span>}
            </div>
          </article>)}
        </div>
      </section>
      <aside className="module-panel teacher-review"><h2><SealCheck size={24} />教师复核</h2>
        <div className="review-confirm"><Check size={56} weight="bold" /><strong>逐条确认</strong></div>
        <p>确认高严重度（高 / 严重）缺口将自动生成对应修改任务，并同步到训练任务中心。</p>
        <button className="page-primary" onClick={() => onNavigate("训练任务中心")}><ClipboardText size={19} />查看训练任务</button>
      </aside>
    </div>
  </section>;
}

function DefensePage({ onToast }) {
  const [comment, setComment] = useState("");
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSessions = async () => {
    try { setSessions(await api.defense.list(PROJECT_ID)); } catch { /* ignore */ }
  };
  useEffect(() => { if (!DEMO_MODE) loadSessions(); /* eslint-disable-next-line */ }, [onToast]);

  const startSession = async () => {
    setBusy(true);
    try {
      const s = await api.defense.create(PROJECT_ID, 3);
      setSession(s);
      setSessions((list) => [s, ...list.filter((x) => x.id !== s.id)]);
    } catch (e) { onToast(e.message || "发起答辩失败"); }
    finally { setBusy(false); }
  };

  const submitAnswer = async () => {
    if (!session || !answer.trim()) { onToast("请先填写作答内容"); return; }
    setBusy(true);
    try {
      const updated = await api.defense.answer(session.id, answer);
      setSession(updated); setAnswer("");
    } catch (e) { onToast(e.message || "提交失败"); }
    finally { setBusy(false); }
  };

  const resume = async (id) => {
    try { setSession(await api.defense.get(id)); } catch (e) { onToast(e.message || "加载失败"); }
  };

  const submitComment = () => { onToast(comment.trim() ? "教师补充评价已提交" : "请先填写补充评价"); if (comment.trim()) setComment(""); };

  if (DEMO_MODE) {
    return <section className="module-page">
      <PageIntro icon={BookOpenText} title="模拟答辩室" description="围绕未闭环评分点自动追问，并将回答质量回写为训练建议。" action={<StatusTag tone="orange">第 2 轮追问 · 02:36</StatusTag>} />
      <div className="defense-layout"><section className="defense-thread">{[["AI评委","你如何证明该系统在真实场景中有效？","10:35:12","ai"],["学生回答","系统试用后效果较好。","10:36:08","student"],["AI二次追问","请说明测试样本、统计口径和前后对比数据。","10:37:21","ai"]].map(([role,text,time,tone]) => <article className={`dialog-card ${tone}`} key={time}><span>{tone === 'ai' ? <Brain size={26} /> : <Student size={26} />}</span><div><strong>{role}</strong><p>{text}</p></div><small>{time}</small></article>)}</section><aside className="defense-side"><section className="module-panel"><h2>回答评价</h2>{[["正面回应","4 / 5","green"],["逻辑清晰","4 / 5","green"],["证据充分","2 / 5","orange"],["技术准确","4 / 5","green"]].map(([label,score,tone]) => <div className="evaluation-row" key={label}><StatusTag tone={tone}>{tone === 'green' ? '通过' : '不足'}</StatusTag><span>{label}</span><strong>{score}</strong></div>)}</section><section className="module-panel evidence-gap"><h2>证据不足</h2><strong>应用成效 · 应用效果与性能表现</strong><p>缺少测试样本说明、统计口径定义以及前后对比数据。</p></section></aside></div><section className="module-panel teacher-comment"><h2>教师补充评价</h2><textarea aria-label="教师补充评价" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="请输入对学生回答的补充评价，聚焦证据充分性、逻辑完整性与改进建议……" /><button className="page-primary" onClick={submitComment}>提交评价</button></section>
    </section>;
  }

  const evaluations = session?.evaluations || { rounds: [] };
  const done = !!evaluations.done;
  const lastRound = evaluations.rounds?.[evaluations.rounds.length - 1];
  const transcript = (session?.transcript || []);

  return <section className="module-page">
    <PageIntro icon={BookOpenText} title="模拟答辩室" description="基于评分要点与作品材料，由智能体评委多轮追问并实时评分，将回答质量回写为训练建议。" action={session ? <StatusTag tone={done ? "green" : "orange"}>{done ? "答辩已结束" : `第 ${session.round} / ${evaluations.maxRounds} 轮`}</StatusTag> : <StatusTag tone="blue">未开始</StatusTag>} />
    {!session ? (
      <div className="defense-start">
        <button className="page-primary" onClick={startSession} disabled={busy}><Brain size={19} />{busy ? "发起中…" : "发起模拟答辩"}</button>
        {sessions.length > 0 && <div className="session-history"><h3>历史答辩</h3>{sessions.map((s) => <button key={s.id} onClick={() => resume(s.id)}><MonitorPlay size={17} />{new Date(s.createdAt).toLocaleString("zh-CN")} · 共 {s.evaluations?.rounds?.length || 0} 轮{((s.evaluations?.done) ? " · 已结束" : "")}</button>)}</div>}
      </div>
    ) : (
      <div className="defense-layout"><section className="defense-thread">
        {transcript.map((entry, i) => <article className={`dialog-card ${entry.role === "judge" ? "ai" : "student"}`} key={i}><span>{entry.role === "judge" ? <Brain size={26} /> : <Student size={26} />}</span><div><strong>{entry.role === "judge" ? "AI 评委" : "学生回答"}</strong><p>{entry.content}</p>{entry.evaluation && <div className="answer-eval"><span>逻辑 {entry.evaluation.logic}</span><span>证据 {entry.evaluation.evidence}</span><span>技术 {entry.evaluation.accuracy}</span><small>{entry.evaluation.comment}</small></div>}</div></article>)}
        {done && evaluations.overall && <article className="dialog-card summary"><span><SealCheck size={26} /></span><div><strong>总评</strong><p>{evaluations.overall}</p></div></article>}
      </section><aside className="defense-side">
        <section className="module-panel"><h2>本轮评价</h2>{lastRound ? <div className="evaluation-row"><StatusTag tone={lastRound.scores.evidence >= 60 ? "green" : "orange"}>{lastRound.scores.evidence >= 60 ? "通过" : "不足"}</StatusTag><span>证据充分</span><strong>{lastRound.scores.evidence}</strong></div> : <p className="empty-state">尚未作答</p>}{lastRound?.comment && <p className="eval-comment">{lastRound.comment}</p>}</section>
        <section className="module-panel evidence-gap"><h2>评分进度</h2><strong>{evaluations.rounds?.length || 0} / {evaluations.maxRounds} 轮</strong><p>已完成评分轮次，结束后可查看总评与改进建议。</p></section>
      </aside></div>
    )}
    {session && !done && (
      <section className="module-panel teacher-comment">
        <h2>学生作答</h2>
        <textarea aria-label="学生作答" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="请输入对评委提问的回答……" />
        <div className="parse-actions">
          <button className="page-primary" onClick={submitAnswer} disabled={busy}>{busy ? "提交中…" : "提交作答"}</button>
          <button className="secondary-button" onClick={() => setSession(null)}>返回列表</button>
        </div>
      </section>
    )}
    {session && (
      <section className="module-panel teacher-comment">
        <h2>教师补充评价</h2>
        <textarea aria-label="教师补充评价" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="请输入对学生回答的补充评价……" />
        <button className="page-primary" onClick={submitComment}>提交评价</button>
      </section>
    )}
  </section>;
}

function ReviewPage({ onToast }) {
  return <section className="module-page">
    <PageIntro icon={Medal} title="赛后复盘" description="汇总训练过程、能力成长与关键问题，沉淀为下一轮可复用的备赛资产。" action={<button className="page-primary" onClick={() => onToast("复盘报告已生成")}>生成复盘报告</button>} />
    <div className="review-metrics">{[[ClipboardText,"训练任务","12 个","blue"],[FileDoc,"作品版本","3 个","cyan"],[CheckCircle,"问题关闭","5 个","green"],[BookOpenText,"答辩轮次","3 个","violet"]].map(([Icon,label,value,tone]) => <article className={tone} key={label}><Icon size={34} weight="duotone" /><span><small>{label}</small><strong>{value}</strong></span></article>)}</div><div className="review-grid"><section className="module-panel growth-panel"><h2>能力成长记录</h2>{[["标准理解",86],["证据意识",78],["作品迭代",82],["答辩表达",88],["团队协作",74]].map(([label,value]) => <div className="ability-row" key={label}><span>{label}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}</strong></div>)}</section><section className="module-panel report-panel"><h2>赛后复盘报告</h2>{[[CheckCircle,"有效做法","需求分析完整；迭代节奏合理；答辩表达逻辑清晰","green"],[WarningCircle,"主要短板","关键证据链不完整；边界条件考虑不全面","orange"],[TrendUp,"下一轮建议","补充对照证据；强化异常场景；完善创新点论证","blue"]].map(([Icon,title,text,tone]) => <article className={tone} key={title}><Icon size={27} weight="duotone" /><div><strong>{title}</strong><p>{text}</p></div></article>)}</section></div><section className="module-panel case-library"><h2>案例沉淀</h2>{[[FileDoc,"赛项模板","沉淀可复用的赛项分析模板"],[Lightbulb,"典型问题","汇总高频问题与解决思路"],[Medal,"优秀做法","沉淀优秀做法与参考案例"]].map(([Icon,title,desc]) => <button key={title} onClick={() => onToast(`已打开：${title}`)}><Icon size={30} weight="duotone" /><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={18} /></button>)}</section>
  </section>;
}

const resources = [
  ["赛项解析模板", "模板", "将赛项规程快速拆解为评分点清单", "2026-08-22"],
  ["应用成效证据清单", "评分材料", "测试样本、统计口径和前后对比核验表", "2026-08-24"],
  ["优秀作品诊断案例", "案例", "从证据缺口到修改任务的完整示例", "2026-08-20"],
  ["模拟答辩高频问题", "题库", "围绕创新、技术和应用价值的追问题库", "2026-08-23"],
];

function ResourcesPage({ onToast }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => resources.filter((item) => item.join("").includes(query.trim())), [query]);
  return <section className="module-page"><PageIntro icon={FolderOpen} title="资源知识库" description="集中管理赛项材料、训练模板、诊断案例与答辩资源。" action={<button className="page-primary" onClick={() => onToast("演示模式：已打开资源上传入口")}><CloudArrowUp size={19} />上传资源</button>} /><section className="module-panel resource-panel"><div className="resource-toolbar"><div className="search-field"><MagnifyingGlass size={19} /><input aria-label="搜索资源" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资源名称、类型或说明" /></div><StatusTag>{filtered.length} 项资源</StatusTag></div><div className="resource-table"><div className="resource-head"><span>资源名称</span><span>类型</span><span>说明</span><span>更新时间</span><span /></div>{filtered.map(([name,type,desc,date]) => <button key={name} onClick={() => onToast(`已打开资源：${name}`)}><span><FileDoc size={24} />{name}</span><StatusTag tone={type === '案例' ? 'green' : 'blue'}>{type}</StatusTag><span>{desc}</span><span>{date}</span><ArrowRight size={17} /></button>)}</div>{filtered.length === 0 && <p className="empty-state">未找到匹配资源，请调整关键词。</p>}</section></section>;
}

function LearningPage({ onNavigate }) {
  return <section className="module-page"><PageIntro icon={GraduationCap} title="学习记录" description="记录个人训练轨迹、能力变化和教师反馈，形成可回顾的成长档案。" action={<button className="page-primary" onClick={() => onNavigate("训练任务中心")}>继续训练<ArrowRight size={18} /></button>} /><div className="learning-layout"><section className="module-panel learning-summary"><h2>本周学习概览</h2><div className="metric-trio"><span><strong>7</strong><small>完成任务</small></span><span><strong>9.5h</strong><small>训练时长</small></span><span><strong>3</strong><small>教师反馈</small></span></div><h3>能力进度</h3>{[["证据意识",78],["方案设计",82],["答辩表达",88]].map(([label,value]) => <div className="ability-row" key={label}><span>{label}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}%</strong></div>)}</section><section className="module-panel timeline-panel"><h2>近期学习轨迹</h2>{[[CheckCircle,"完成作品文档修订","补充了应用场景和价值说明","今天 10:32"],[MonitorPlay,"完成作品诊断","识别 3 个应用成效证据缺口","昨天 16:20"],[BookOpenText,"参加第 2 轮模拟答辩","证据充分度得分提升至 4/5","08-23 14:10"],[UsersThree,"收到教师复核意见","建议补充 12 组测试样本","08-22 09:45"]].map(([Icon,title,desc,time]) => <article key={time}><span><Icon size={20} /></span><div><strong>{title}</strong><p>{desc}</p></div><small>{time}</small></article>)}</section></div></section>;
}

function SettingsPage({ onToast }) {
  const [preferences, setPreferences] = useState({ task: true, review: true, risk: true });
  const toggle = (key) => setPreferences((current) => ({...current, [key]: !current[key]}));
  return <section className="module-page"><PageIntro icon={GearSix} title="设置中心" description="管理演示账号、通知方式与工作区偏好。" /><div className="settings-layout"><section className="module-panel account-settings"><h2>账号信息</h2><div className="account-card"><UserCircle size={52} weight="fill" /><div><strong>张老师</strong><span>teacher · 指导教师</span></div><StatusTag tone="green">演示账号</StatusTag></div><p>当前账号仅用于本地原型演示，不连接真实用户系统。</p></section><section className="module-panel preference-settings"><h2>通知设置</h2>{[["task","任务到期提醒","任务截止前 24 小时提醒"],["review","学生提交提醒","学生提交作品或修改结果时提醒"],["risk","风险预警提醒","发现高风险评分点时提醒"]].map(([key,title,desc]) => <button key={key} className="preference-row" onClick={() => toggle(key)}><span><strong>{title}</strong><small>{desc}</small></span><i className={preferences[key] ? 'on' : ''}><b /></i></button>)}<button className="page-primary save-settings" onClick={() => onToast("设置已保存")}>保存设置</button></section></div></section>;
}

export function WorkspacePage({ pageKey, onNavigate, onToast, onOpenDiagnosis }) {
  const props = { onNavigate, onToast, onOpenDiagnosis };
  const pages = { analysis: AnalysisPage, training: TrainingPage, diagnosis: DiagnosisPage, defense: DefensePage, review: ReviewPage, resources: ResourcesPage, learning: LearningPage, settings: SettingsPage };
  const Page = pages[pageKey] ?? AnalysisPage;
  return <Page {...props} />;
}

