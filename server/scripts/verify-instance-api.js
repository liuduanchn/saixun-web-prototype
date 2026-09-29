// 实例项目数据端到端 API 校验：登录 → 切换团队 → 各模块接口
// 注意：/tasks /works /resources /notifications 返回 { items, total, ... } 分页结构
const BASE = 'http://127.0.0.1:8080/api';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
/** 统一取列表（兼容数组与分页结构） */
const list = (d) => (Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []));

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`    ${ok ? 'OK ' : '!! '} ${label}${detail ? '  ' + detail : ''}`);
};

/**
 * 每个项目的差异化预期（与 prisma/instance-project-profiles.ts 一致）
 * works/resources/defenses = 数量；active = 进行中的答辩场次；confirmed/rejected = 诊断复核状态数
 */
const PROJECTS = [
  { tenantId: 'pearl-tenant', tenantName: '珠联璧合（珍珠智能分拣）', projectId: 'pearl-project', works: 3, resources: 6, defenses: 1, active: 0, confirmed: 5, rejected: 2, stage: 'REVIEW' },
  { tenantId: 'sidaopu-tenant', tenantName: '思导谱团队', projectId: 'sidaopu-project', works: 2, resources: 4, defenses: 1, active: 1, confirmed: 0, rejected: 0, stage: 'DESIGN' },
  { tenantId: 'mingzhu-tenant', tenantName: '明猪智能队', projectId: 'mingzhu-project', works: 2, resources: 5, defenses: 2, active: 1, confirmed: 2, rejected: 1, stage: 'POLISH' },
  { tenantId: 'zhihuaxing-tenant', tenantName: '智划星团队', projectId: 'zhihuaxing-project', works: 2, resources: 4, defenses: 1, active: 0, confirmed: 0, rejected: 1, stage: 'DESIGN' },
  { tenantId: 'yihuoji-tenant', tenantName: '婺州码客', projectId: 'yihuoji-project', works: 2, resources: 5, defenses: 1, active: 0, confirmed: 1, rejected: 1, stage: 'PROTOTYPE' },
  { tenantId: 'sheyun-tenant', tenantName: '数智畲韵团队', projectId: 'sheyun-project', works: 2, resources: 5, defenses: 1, active: 0, confirmed: 1, rejected: 0, stage: 'PROTOTYPE' },
];

(async () => {
  console.log('===== A. 登录（每角色仅一次，避开登录限流 5 次/分钟）=====');
  const login = async (username) => {
    const res = await req('/auth/login', { method: 'POST', body: { username, password: '123456' } });
    if (res.status >= 300) throw new Error(`${username} 登录失败 ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
    console.log(`  OK ${res.data.user.name.padEnd(6)} / ${res.data.user.role.padEnd(7)} / 团队=${res.data.user.tenantId}`);
    return res.data.access_token;
  };
  let token = await login('teacher');
  const studentTokens = {
    pearl_student1: await login('pearl_student1'),
    pearl_student2: await login('pearl_student2'),
    teacher3: await login('teacher3'),
  };

  let r = await req('/tenants/mine', { token });
  const teams = r.data;
  const newOnes = teams.filter((t) => PROJECTS.some((p) => p.tenantId === t.tenantId));
  console.log(`  teacher 可切换团队 ${teams.length} 个；其中新增 ${newOnes.length} 个：${newOnes.map((t) => t.name).join('、')}`);
  const tFeed = await req('/notifications', { token });
  const tFeedItems = list(tFeed.data);
  console.log(`  teacher 通知 ${tFeedItems.length} 条（含新项目进展同步）：`);
  tFeedItems.filter((n) => PROJECTS.some((p) => (n.detail || '').includes(p.projectId.replace('-project', '')) || /当前进展/.test(n.detail || ''))).slice(0, 2)
    .forEach((n) => console.log(`      [${n.category}] ${n.detail}`));
  console.log(`  teacher 学习记录 ${list((await req('/learning/events', { token })).data).length} 条`);

  console.log('\n===== B. 逐个切换到新团队并验证各模块（含差异化预期）=====');
  for (const P of PROJECTS) {
    r = await req('/tenants/switch', { method: 'POST', body: { tenantId: P.tenantId }, token });
    if (r.status >= 300) { console.log(`  !! ${P.tenantName} 切换失败`, r.status, r.data); continue; }
    token = r.data.access_token;

    const [projects, tasks, coverage, criteria, works, defense, resources, review, caseLib] = await Promise.all([
      req('/projects', { token }),
      req(`/tasks?projectId=${P.projectId}`, { token }),
      req(`/tasks/coverage?projectId=${P.projectId}`, { token }),
      req(`/criteria?projectId=${P.projectId}`, { token }),
      req(`/works?projectId=${P.projectId}`, { token }),
      req(`/defense/sessions?projectId=${P.projectId}`, { token }),
      req(`/resources?projectId=${P.projectId}`, { token }),
      req(`/review/summary?projectId=${P.projectId}`, { token }),
      req(`/review/case-library?projectId=${P.projectId}`, { token }),
    ]);

    const proj = list(projects.data)[0];
    const taskList = list(tasks.data);
    const workList = list(works.data).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    const resList = list(resources.data);
    const defList = list(defense.data);
    const caseList = list(caseLib.data?.goodPractices);
    const m = review.data?.metrics || {};

    console.log(`\n  【${P.tenantName}】${P.tenantId}`);
    check('赛项项目与阶段', proj?.id === P.projectId && proj?.currentStage === P.stage, `${proj?.name} / ${proj?.currentStage}`);
    check('评分标准', list(criteria.data).length === 5, `${list(criteria.data).length} 个维度`);
    check('训练任务', taskList.length === 8, `${taskList.length} 条，覆盖率 ${coverage.data?.coverageRate}%`);
    check(
      '任务已分配负责人',
      taskList.every((t) => t.ownerId) && taskList.every((t) => t.owner?.name || true),
      `负责人字段非空：${taskList.filter((t) => t.ownerId).length}/8`,
    );
    check('作品版本数', workList.length === P.works, `${workList.length} 个（预期 ${P.works}）`);
    check('资源知识库', resList.length === P.resources, `${resList.length} 条（预期 ${P.resources}）`);
    check('模拟答辩场次', defList.length === P.defenses, `${defList.length} 场（预期 ${P.defenses}）`);
    const activeDef = defList.filter((s) => !(s.evaluations?.done));
    check('含进行中答辩', activeDef.length === P.active, `进行中 ${activeDef.length} 场（预期 ${P.active}）；${defList.map((s) => s.title).join(' | ')}`);
    check(
      '复盘指标',
      m.taskCount === 8 && m.workVersions === P.works && m.issuesTotal === 15 && m.defenseRounds === P.defenses,
      `任务${m.taskCount} 作品${m.workVersions} 问题${m.issuesTotal}(闭环${m.issuesClosed}) 答辩${m.defenseRounds} 覆盖率${review.data?.coverage?.coverageRate}%`,
    );
    check(
      '案例沉淀库',
      list(caseLib.data?.templates).length === 5 && caseList.length === 4 && list(caseLib.data?.issues).length > 0,
      `模板${list(caseLib.data?.templates).length} 典型问题${list(caseLib.data?.issues).length} 优秀做法${caseList.length}`,
    );

    if (workList.length) {
      const latest = workList[0];
      const detail = await req(`/works/${latest.id}`, { token });
      check('最新作品正文', (detail.data?.content || '').length > 200, `V${detail.data?.version}，content ${(detail.data?.content || '').length} 字`);
      const dgList = list((await req(`/diagnosis?workVersionId=${latest.id}`, { token })).data);
      const confirmed = dgList.filter((x) => x.status === 'CONFIRMED').length;
      const rejected = dgList.filter((x) => x.status === 'REJECTED').length;
      check('作品诊断条数', dgList.length === 15, `${dgList.length} 条（挂最新版本）`);
      check('诊断内容非空', dgList.every((x) => x.issues && x.suggestions && x.scorePoint?.name), '每条含评分点/问题/建议');
      check(
        '诊断复核状态差异化',
        confirmed === P.confirmed && rejected === P.rejected,
        `已确认 ${confirmed}（预期 ${P.confirmed}）/ 已驳回 ${rejected}（预期 ${P.rejected}）/ 待确认 ${dgList.length - confirmed - rejected}`,
      );
      const files = await fetch(`${BASE}/files/${latest.fileRef}`, { headers: { Authorization: `Bearer ${token}` } });
      const buf = await files.arrayBuffer();
      check('文件下载', files.status === 200 && buf.byteLength > 500, `${latest.fileRef} → ${files.status}，${buf.byteLength} 字节`);
    }

    if (defList.length) {
      const s = await req(`/defense/sessions/${defList[0].id}`, { token });
      const tr = s.data?.transcript || [];
      check(
        '答辩详情可读',
        tr.length > 0 && tr.some((x) => x.role === 'student'),
        `${s.data?.title}｜轮次=${s.data?.round}/${s.data?.evaluations?.maxRounds}｜记录 ${tr.length} 条｜总评=${s.data?.evaluations?.overall ? '有' : '无'}`,
      );
    }

    const [tme, tmem] = await Promise.all([req('/tenants/me', { token }), req('/tenants/members', { token })]);
    check('团队资料', tme.data?.name === P.tenantName, `${tme.data?.name} / 成员 ${list(tmem.data).length} 人 / 项目 ${tme.data?.projectCount} 个`);
  }

  console.log('\n===== C. 学生视角（pearl_student1 = 何浩轩，作品上传者）=====');
  {
    const st = studentTokens.pearl_student1;
    const [me, mine, dgMine, ev, nf] = await Promise.all([
      req('/auth/me', { token: st }),
      req('/works/mine', { token: st }),
      req('/diagnosis/mine', { token: st }),
      req('/learning/events', { token: st }),
      req('/notifications', { token: st }),
    ]);
    console.log(`  OK ${me.data?.name} / ${me.data?.role} / 团队=${me.data?.tenantId}`);
    check('我的作品', list(mine.data).length === 3, `${list(mine.data).length} 个（珍珠项目 3 版）`);
    check('我的诊断', list(dgMine.data).length === 15, `${list(dgMine.data).length} 条`);
    check('学习记录', list(ev.data).length > 0, `${list(ev.data).length} 条`);
    check('通知', list(nf.data).length > 0, `${list(nf.data).length} 条`);
  }

  console.log('\n===== D. 非上传者学生（pearl_student2 = 王欣航）=====');
  {
    const st2 = studentTokens.pearl_student2;
    const [ev2, nf2] = await Promise.all([
      req('/learning/events', { token: st2 }),
      req('/notifications', { token: st2 }),
    ]);
    check('学习记录', list(ev2.data).length > 0, `${list(ev2.data).length} 条`);
    check('通知', list(nf2.data).length > 0, `${list(nf2.data).length} 条`);
  }

  console.log('\n===== E. 既有团队未被破坏 =====');
  r = await req('/tenants/mine', { token });
  console.log(`  teacher 成员资格：${r.data.map((t) => `${t.name}[${t.role}]`).join('、')}`);
  for (const [tid, expected] of [['demo-tenant', 1], ['innovation-tenant', 2]]) {
    r = await req('/tenants/switch', { method: 'POST', body: { tenantId: tid }, token });
    if (r.status >= 300) { check(`${tid} 切换`, false, JSON.stringify(r.data).slice(0, 80)); continue; }
    token = r.data.access_token;
    const pj = await req('/projects', { token });
    const first = list(pj.data)[0];
    const tl = first ? await req(`/tasks?projectId=${first.id}`, { token }) : { data: null };
    check(`${tid} 既有项目`, list(pj.data).length === expected, `${list(pj.data).map((x) => x.name).join('、')}；首个项目任务 ${list(tl.data).length} 条`);
  }
  {
    const pj = await req('/projects', { token: studentTokens.teacher3 });
    check('info-tenant 既有项目（teacher3）', list(pj.data).length === 2, list(pj.data).map((x) => x.name).join('、'));
  }

  // 还原 teacher 活跃团队为其原值
  r = await req('/tenants/switch', { method: 'POST', body: { tenantId: 'innovation-tenant' }, token });
  console.log(`\n  已把 teacher 活跃团队还原为 innovation-tenant：${r.status < 300 ? 'OK' : '失败'}`);

  console.log(`\n===== 结果：通过 ${pass} 项，失败 ${fail} 项 =====`);
  if (fail > 0) process.exitCode = 2;
})().catch((e) => { console.error('ERR', e); process.exit(1); });
