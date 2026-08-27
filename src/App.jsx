import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BookOpenText, CaretDown, CaretRight, ChartDonut, Check, CheckCircle,
  ClipboardText, Clock, Cube, FileText, GearSix, House, ListChecks,
  MagnifyingGlass, MonitorPlay, PaperPlaneTilt, ShieldWarning, SignOut, Sparkle,
  Package, Student, UserCircle, UsersThree, WarningCircle, X,
} from "@phosphor-icons/react";
import {
  clearSession, getUnreadNotificationCount, loadSession, markAllNotificationsRead,
  markNotificationRead, resolveNotificationTarget, resolvePage, saveSession,
} from "./appState.js";
import { LoginScreen } from "./LoginScreen.jsx";
import { WorkspacePage } from "./pages.jsx";
import { getSidebarPresentation } from "./sidebarState.js";
import { api, DEMO_MODE, PROJECT_ID, setToken } from "./api.js";
import { normalizeTask } from "./taskModel.js";

const stages = [
  { id: 1, label: "赛项理解", state: "done" }, { id: 2, label: "方案设计", state: "done" },
  { id: 3, label: "原型开发", state: "done" }, { id: 4, label: "作品打磨", state: "active" },
  { id: 5, label: "模拟答辩", state: "next" }, { id: 6, label: "赛后复盘", state: "next" },
];

const navItems = [
  { label: "竞赛项目驾驶舱", icon: House }, { label: "赛项解析中心", icon: Cube },
  { label: "训练任务中心", icon: ListChecks }, { label: "作品诊断中心", icon: MonitorPlay },
  { label: "模拟答辩室", icon: BookOpenText }, { label: "赛后复盘", icon: ClipboardText },
  { label: "资源知识库", icon: Package }, { label: "学习记录", icon: Student },
  { label: "设置中心", icon: GearSix },
];
const studentNavItems = [
  { label: "我的任务", icon: Student }, { label: "我的作品", icon: PaperPlaneTilt },
  { label: "诊断反馈", icon: MagnifyingGlass }, { label: "模拟答辩", icon: MonitorPlay },
  { label: "设置中心", icon: GearSix },
];

const initialTasks = [
  { id: 1, title: "补充应用成效对比数据", priority: "高优先级", owner: "李同学", due: "8-25 截止", done: false },
  { id: 2, title: "完善应用成效统计口径说明", priority: "高优先级", owner: "王同学", due: "8-26 截止", done: false },
  { id: 3, title: "优化关键指标可视化图表", priority: "中优先级", owner: "陈同学", due: "8-27 截止", done: false },
  { id: 4, title: "补充用户反馈与改进记录", priority: "中优先级", owner: "张同学", due: "8-28 截止", done: false },
  { id: 5, title: "整理应用场景与价值说明", priority: "已完成", owner: "刘同学", due: "8-22 完成", done: true },
];

const detailRows = [
  { label: "测试样本", status: "缺失", detail: "尚未上传可核验的测试样本，无法判断成效代表性。" },
  { label: "统计口径", status: "薄弱", detail: "统计对象、计算方式与数据来源仍需明确。" },
  { label: "前后对比", status: "缺失", detail: "缺少优化前后的核心指标对比数据。" },
];

const initialNotifications = [
  { id: 1, category: "作品审核", title: "李同学提交了作品材料", detail: "作品说明书与演示材料等待教师审核。", time: "8-24 10:32", targetNav: "作品诊断中心", read: false },
  { id: 2, category: "任务复核", title: "王同学提交了修改任务结果", detail: "应用成效补证任务已完成，等待教师复核。", time: "8-24 09:18", targetNav: "训练任务中心", read: false },
];

function AppIconButton({ children, label, onClick, ...props }) {
  return <button className="icon-button" aria-label={label} onClick={onClick} {...props}>{children}</button>;
}

const NOTIF_ICONS = {
  "作品诊断": FileText,
  "任务复核": ListChecks,
  "作品审核": FileText,
  "模拟答辩": UsersThree,
};

function formatNotifTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function App() {
  const profileAreaRef = useRef(null);
  const notificationAreaRef = useRef(null);
  const [user, setUser] = useState(() => loadSession(window.localStorage));
  const [activeNav, setActiveNav] = useState(user?.role === "STUDENT" ? "我的任务" : "竞赛项目驾驶舱");
  const [tasks, setTasks] = useState(DEMO_MODE ? initialTasks : []);
  const [coverage, setCoverage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [toast, setToast] = useState("");
  const [created, setCreated] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECT_ID);
  const [teams, setTeams] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(user?.tenantId || "");
  const taskSummary = useMemo(() => `${tasks.filter((task) => task.done).length}/${tasks.length}`, [tasks]);
  const unreadNotificationCount = useMemo(() => getUnreadNotificationCount(notifications), [notifications]);
  const sidebarPresentation = getSidebarPresentation(sidebarCollapsed);
  const activeTeamName = teams.find((t) => t.tenantId === activeTenantId)?.name || user?.name || "智造先锋队";

  // 登录后拉取可切换的赛项列表（演示模式不请求）；切换团队后若当前项目不在列表则自动选首个
  useEffect(() => {
    if (DEMO_MODE || !user) return undefined;
    let active = true;
    api.projects.list().then((list) => {
      if (!active) return;
      const arr = Array.isArray(list) ? list : [];
      setProjects(arr);
      setSelectedProjectId((current) => (arr.some((p) => p.id === current) ? current : (arr[0]?.id || "")));
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // 登录后拉取可切换的团队列表（演示模式不请求）
  useEffect(() => {
    if (DEMO_MODE || !user) return undefined;
    let active = true;
    api.tenants.mine().then((list) => {
      if (!active) return;
      const arr = Array.isArray(list) ? list : [];
      setTeams(arr);
      setActiveTenantId(user.tenantId);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // 登录后拉取真实通知（演示模式保留内置示例）
  useEffect(() => {
    if (DEMO_MODE || !user) return undefined;
    let active = true;
    api.notifications.list().then((list) => {
      if (active && Array.isArray(list)) setNotifications(list);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!profileOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!profileAreaRef.current?.contains(event.target)) setProfileOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [profileOpen]);

  useEffect(() => {
    if (!notificationOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!notificationAreaRef.current?.contains(event.target)) setNotificationOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [notificationOpen]);

  // 登录后拉取真实任务与评分覆盖率（演示模式保留内置示例数据），随赛项切换刷新
  useEffect(() => {
    if (DEMO_MODE || !user) return undefined;
    let active = true;
    (async () => {
      try {
        const [taskList, cov] = await Promise.all([
          api.tasks.list(selectedProjectId),
          api.tasks.coverage(selectedProjectId),
        ]);
        if (!active) return;
        setTasks(taskList.map(normalizeTask));
        setCoverage(cov);
      } catch (err) {
        if (active) showToast(err?.message || "任务数据加载失败");
      }
    })();
    return () => {
      active = false;
    };
  }, [user, selectedProjectId]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__saixunToastTimer);
    window.__saixunToastTimer = window.setTimeout(() => setToast(""), 2600);
  };

  const createRevisionTask = async () => {
    if (created) {
      showToast("该修改任务已存在，可在任务中心继续编辑");
      return;
    }
    if (DEMO_MODE) {
      setTasks((current) => [{ id: Date.now(), title: "补齐应用成效证据链并提交教师复核", priority: "高优先级", owner: "待分配", due: "8-29 截止", done: false, fresh: true }, ...current]);
      setCreated(true);
      showToast("修改任务已生成，并同步到训练任务中心");
      return;
    }
    try {
      const created2 = await api.tasks.create({
        projectId: selectedProjectId,
        title: "补齐应用成效证据链并提交教师复核",
        status: "NEEDS_FIX",
      });
      setTasks((current) => [normalizeTask(created2), ...current]);
      setCreated(true);
      showToast("修改任务已生成，并同步到训练任务中心");
    } catch (err) {
      showToast(err?.message || "创建修改任务失败");
    }
  };

  const toggleTask = (id) => setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  const handleNav = (label) => {
    setActiveNav(label);
    setNotificationOpen(false);
  };
  const openNotification = (notification) => {
    setNotifications((current) => markNotificationRead(current, notification.id));
    if (!DEMO_MODE && notification.id) {
      api.notifications.markRead(notification.id).catch(() => {});
    }
    setActiveNav(resolveNotificationTarget(notification));
    setNotificationOpen(false);
    showToast(`已打开：${notification.title}`);
  };
  const markAllNotifications = () => {
    setNotifications((current) => markAllNotificationsRead(current));
    if (!DEMO_MODE) api.notifications.markAllRead().catch(() => {});
  };
  const logout = () => {
    clearSession(window.localStorage);
    setProfileOpen(false);
    setNotificationOpen(false);
    setActiveNav("竞赛项目驾驶舱");
    setUser(null);
  };
  const switchTenant = async (tenantId, opts = {}) => {
    if (DEMO_MODE) {
      showToast("演示模式：未连接后端，无法切换团队");
      return;
    }
    const { stay = false } = opts;
    const target = teams.find((t) => t.tenantId === tenantId);
    try {
      const result = await api.tenants.switch(tenantId);
      setToken(result.access_token);
      saveSession(window.localStorage, result.user);
      setUser(result.user);
      setActiveTenantId(tenantId);
      // 切换团队后重置项目选择（projects effect 会按新租户重新拉取）
      setSelectedProjectId("");
      if (!stay) {
        // 顶栏下拉切换时回到驾驶舱；设置中心内切换则停留在当前页面
        setActiveNav(result.user?.role === "STUDENT" ? "我的任务" : "竞赛项目驾驶舱");
      }
      showToast(`已切换到团队：${target?.name ?? "新团队"}`);
    } catch (err) {
      showToast(err?.message || "切换团队失败");
    }
  };
  const toggleSidebar = () => {
    setProfileOpen(false);
    setSidebarCollapsed((value) => !value);
  };

  // 团队改名后刷新顶栏团队列表（含当前活跃团队名）
  const refreshTeams = () => {
    if (DEMO_MODE || !user) return;
    api.tenants.mine().then((list) => {
      const arr = Array.isArray(list) ? list : [];
      setTeams(arr);
      setActiveTenantId(user.tenantId);
    }).catch(() => {});
  };

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className={sidebarPresentation.shellClassName}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-row">
          <div><strong>赛训智舱</strong><span>AI 备赛教练</span></div>
          <AppIconButton label={sidebarPresentation.toggleLabel} title={sidebarPresentation.toggleLabel} aria-pressed={sidebarPresentation.togglePressed} onClick={toggleSidebar}><ListChecks size={22} /></AppIconButton>
        </div>
        <nav className="nav-list">
          {(user?.role === 'STUDENT' ? studentNavItems : navItems).map(({ label, icon: Icon }, index) => (
            <button key={label} aria-label={label} title={sidebarCollapsed ? label : undefined} aria-current={activeNav === label ? "page" : undefined} className={`nav-item ${activeNav === label ? "active" : ""} ${index === 6 ? "nav-divider" : ""}`} onClick={() => handleNav(label)}>
              <Icon size={22} weight={activeNav === label ? "fill" : "regular"} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="user-block" ref={profileAreaRef}>
          <UserCircle size={38} weight="fill" />
          <div><strong>{user.name}</strong><span>{user.role}</span></div>
          <AppIconButton label="展开账户菜单" onClick={() => { setNotificationOpen(false); setProfileOpen((value) => !value); }}><CaretDown size={16} /></AppIconButton>
          {profileOpen && <div className="profile-menu">
            <button onClick={() => handleNav("设置中心")}><GearSix size={17} />设置中心</button>
            <button onClick={logout}><SignOut size={17} />退出登录</button>
          </div>}
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <select className="project-switch" aria-label="切换赛项" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
          {projects.length === 0 ? (
            <option value={selectedProjectId}>AI应用开发赛</option>
          ) : (
            projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))
          )}
        </select>
        {teams.length > 1 && (
          <select className="team-switch" aria-label="切换团队" value={activeTenantId} onChange={(event) => switchTenant(event.target.value)}>
            {teams.map((team) => (
              <option key={team.tenantId} value={team.tenantId}>{team.name}{team.isActive ? "（当前）" : ""}</option>
            ))}
          </select>
        )}
          <div className="top-actions">
            <div className="notification-area" ref={notificationAreaRef}>
              <AppIconButton label={`通知，${unreadNotificationCount} 条未读`} aria-expanded={notificationOpen} aria-haspopup="dialog" onClick={() => { setProfileOpen(false); setNotificationOpen((value) => !value); }}><Bell size={22} />{unreadNotificationCount > 0 && <span className="notification-dot">{unreadNotificationCount}</span>}</AppIconButton>
              {notificationOpen && <section className="notification-panel" aria-label="通知中心">
                <header><div><h2>通知中心</h2><span>{unreadNotificationCount > 0 ? `${unreadNotificationCount} 条未读` : "全部已读"}</span></div><button disabled={unreadNotificationCount === 0} onClick={markAllNotifications}>全部标为已读</button></header>
                <div className="notification-list">{notifications.map((notification) => {
                  const NotifIcon = NOTIF_ICONS[notification.category] ?? Bell;
                  const notifTime = notification.time ?? formatNotifTime(notification.createdAt);
                  return (
                    <button className={`notification-item ${notification.read ? "read" : "unread"}`} key={notification.id} onClick={() => openNotification(notification)}>
                      <span className="notification-symbol"><NotifIcon size={21} /></span>
                      <span className="notification-copy"><small>{notification.category}</small><strong>{notification.title}</strong><p>{notification.detail}</p><time>{notifTime}</time></span>
                      <span className="notification-link">查看详情<CaretRight size={14} /></span>
                    </button>
                  );
                })}</div>
              </section>}
            </div>
            <span className="today">2026-08-24&nbsp;&nbsp;星期一</span>
          </div>
        </header>

        {activeNav === "竞赛项目驾驶舱" ? <section className="workspace">
          <div className="project-meta"><span><UsersThree size={21} />团队：<strong>{activeTeamName}</strong></span><i /><span><Cube size={21} />当前阶段：<strong>作品打磨</strong></span></div>
          <section className="stage-track" aria-label="备赛阶段">
            {stages.map((stage) => <button key={stage.id} className={`stage ${stage.state}`} onClick={() => showToast(`已查看：${stage.label}`)}>
              <span className="stage-number">{stage.id}</span><strong>{stage.label}</strong>
              <span className="stage-state">{stage.state === "done" ? <Check size={13} weight="bold" /> : stage.state === "active" ? <Sparkle size={13} weight="fill" /> : null}</span>
            </button>)}
          </section>

          <div className="content-grid">
            <div className="primary-column">
              <section className="recommendation-panel">
                <div className="recommendation-icon"><WarningCircle size={70} weight="duotone" /></div>
                <div className="recommendation-copy">
                  <span className="eyebrow">智能推荐</span><h1>优先补齐应用成效证据</h1>
                  <p>“应用成效”得分覆盖率仅 40%，是当前最高风险项。补齐测试样本、统计口径和前后对比，可显著提升评分可信度。</p>
                  <button className="criterion-chip" onClick={() => setDrawerOpen(true)}>关联评分点&nbsp;&nbsp;应用成效（20%）<CaretRight size={15} /></button>
                </div>
                <div className="score-visual" aria-label="应用成效得分覆盖率 40%"><img src="/assets/progress-orange.png" alt="" /><strong>40%</strong><span>得分覆盖率</span></div>
                <button className="primary-action" onClick={createRevisionTask}><FileText size={24} weight="bold" />{created ? "查看修改任务" : "生成修改任务"}</button>
              </section>

              <div className="lower-grid">
                <section className="task-panel" id="tasks">
                  <div className="section-heading"><div><h2>本周任务</h2><span>{taskSummary} 已完成</span></div><button onClick={() => handleNav("训练任务中心")}>查看全部<CaretRight size={15} /></button></div>
                  <div className="task-list">{tasks.slice(0, 5).map((task) => <div className={`task-row ${task.done ? "done" : ""} ${task.fresh ? "fresh" : ""}`} key={task.id}>
                    <button className="check-button" aria-label={`${task.done ? "取消完成" : "标记完成"}${task.title}`} onClick={() => toggleTask(task.id)}>{task.done ? <CheckCircle size={19} weight="fill" /> : <span />}</button>
                    <strong>{task.title}</strong><span className={`priority ${task.priority === "高优先级" ? "high" : task.priority === "已完成" ? "complete" : "medium"}`}>{task.priority}</span>
                    <span className="owner"><UserCircle size={15} />{task.owner}</span><span className="due"><Clock size={15} />{task.due}</span>
                  </div>)}</div>
                </section>
                <section className="risk-panel">
                  <div className="risk-heading"><div><ShieldWarning size={25} weight="fill" /><h2>风险预警</h2></div><span>最高风险</span></div>
                  <h3>应用成效（20%）<strong>覆盖率 40%</strong></h3><p>关键证据不足：缺少测试样本、统计口径说明以及优化前后效果对比，可能影响 80% 以上得分。</p>
                  <button className="risk-action" onClick={() => setDrawerOpen(true)}><MagnifyingGlass size={18} />诊断证据缺口<CaretRight size={17} /></button>
                </section>
              </div>
            </div>

            <aside className="context-rail">
              <section className="coverage-panel">
                <div className="section-heading"><h2>评分覆盖与进度</h2></div>
                <div className="coverage-visual"><img src="/assets/progress-green.png" alt="" /><strong>{coverage ? coverage.coveredScorePoints : 18}<span>/{coverage ? coverage.totalScorePoints : 25}</span></strong></div>
                <p>评分点覆盖率 <strong>{coverage ? coverage.coverageRate : 72}%</strong></p>
                <div className="legend"><span><i className="covered" />已覆盖评分点</span><strong>{coverage ? coverage.coveredScorePoints : 18}</strong></div><div className="legend"><span><i />未覆盖评分点</span><strong>{coverage ? Math.max(0, coverage.totalScorePoints - coverage.coveredScorePoints) : 7}</strong></div>
                <button className="secondary-button" onClick={() => setDrawerOpen(true)}>查看详情</button>
              </section>
              <section className="review-panel" id="pending-review">
                <div className="section-heading"><h2>待我审核</h2><strong>2 项</strong></div>
                <button onClick={() => showToast("已打开李同学提交的作品材料")}><span><strong>李同学</strong> 提交的作品材料</span><small>8-24 10:32</small></button>
                <button onClick={() => showToast("已打开王同学的修改任务结果")}><span><strong>王同学</strong> 修改任务结果</span><small>8-24 09:18</small></button>
                <a href="#tasks">查看待办<CaretRight size={14} /></a>
              </section>
              <section className="activity-panel" id="activity">
                <div className="section-heading"><h2>近期动态</h2></div>
                <p><strong>陈同学</strong> 完成了任务<br /><span>优化关键指标可视化图表</span><small>2 小时前</small></p>
                <p><strong>系统</strong> 更新了评分要点<br /><span>应用成效 · 统计口径说明</span><small>5 小时前</small></p>
                <a href="#activity" onClick={(event) => { event.preventDefault(); showToast("已展开团队全部动态"); }}>查看全部<CaretRight size={14} /></a>
              </section>
            </aside>
          </div>
        </section> : <WorkspacePage pageKey={resolvePage(activeNav)} projectId={selectedProjectId} user={user} activeTenantId={activeTenantId} onNavigate={handleNav} onToast={showToast} onOpenDiagnosis={() => setDrawerOpen(true)} onTeamUpdate={refreshTeams} onSwitchTenant={switchTenant} />}
      </main>

      {drawerOpen && <div className="drawer-backdrop" onMouseDown={() => setDrawerOpen(false)}>
        <aside className="evidence-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="应用成效证据诊断">
          <div className="drawer-heading"><div><span>应用成效 · 20%</span><h2>证据缺口诊断</h2></div><AppIconButton label="关闭诊断" onClick={() => setDrawerOpen(false)}><X size={22} /></AppIconButton></div>
          <div className="drawer-score"><ChartDonut size={66} weight="duotone" /><div><strong>40%</strong><span>当前证据完整度</span></div></div>
          <p className="drawer-intro">当前材料尚不足以形成可核验的应用成效证据链，建议按以下顺序补齐。</p>
          <div className="evidence-list">{detailRows.map((row, index) => <div key={row.label}><span className="evidence-index">{index + 1}</span><div><strong>{row.label}</strong><p>{row.detail}</p></div><span className="evidence-status">{row.status}</span></div>)}</div>
          <button className="primary-action drawer-action" onClick={() => { createRevisionTask(); setDrawerOpen(false); }}><PaperPlaneTilt size={22} weight="fill" />生成补证任务</button>
        </aside>
      </div>}
      {toast && <div className="toast" role="status"><CheckCircle size={21} weight="fill" />{toast}</div>}
    </div>
  );
}
