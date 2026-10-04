# Design QA

## Comparison target

- Source visual truth: `reference-option-1.png`
- Browser-rendered implementation: `implementation-final.png`
- Desktop viewport: 1440 × 1024 CSS px
- Device pixel ratio: 1
- State: 指导教师 / AI应用开发赛 / 竞赛项目驾驶舱默认状态
- Source pixels: 1487 × 1058
- Normalization: source was bicubic-resized to 1440 × 1024 as `source-normalized.png`
- Implementation pixels: 1440 × 1024

## Evidence

- Full-view side-by-side comparison: `qa-comparison-full.png`（左：方案 1，右：实现）
- Hero focused comparison: `qa-comparison-hero.png`
- Tasks and risk focused comparison: `qa-comparison-bottom.png`
- Responsive evidence: `implementation-responsive-768.png`

The focused comparisons were required because the full-view comparison could not show the progress-ring quality, Chinese typography, task-row density, and risk-panel borders clearly enough.

## Required fidelity surfaces

- Fonts and typography: Noto Sans SC 400/500/600/700 is bundled locally. Main title, section title, body, metadata, and status hierarchy align with the source; wrapping and truncation remain controlled at 1440 px and 768 px.
- Spacing and layout rhythm: fixed left rail, six-stage progress track, central recommendation panel, lower task/risk split, and right context rail match the source composition. Final page size is exactly 1440 × 1024 with no document overflow.
- Colors and visual tokens: deep navy base, electric blue primary action, green completion, orange risk, red warning, muted blue-gray borders, and surface contrast are consistent with the source.
- Image quality and asset fidelity: the 40% and 72% progress rings use dedicated raster assets generated in the source art direction. No placeholder or handcrafted SVG asset remains. Standard UI icons use Phosphor Icons.
- Copy and content: project, team, stage, scoring criterion, risk, tasks, reviewers, dates, and actions match the selected concept and the project prototype document.

## Interaction verification

- Opened “诊断证据缺口” and verified the evidence drawer.
- Generated a remediation task and verified that it appeared at the top of the weekly task list.
- Marked the generated task complete and verified the accessible button state changed.
- Checked desktop browser console: no errors.
- Checked 768 × 900 responsive viewport: sidebar collapses, core action remains visible, and no horizontal document overflow occurs.

## Comparison history

### Initial pass

- [P2] The generic donut icon intersected the editable 40% and 18/25 values.
  - Fix: replaced both with dedicated orange and green progress-ring raster assets, retaining editable HTML values above them.
- [P2] The document exceeded the desktop viewport by 5 px, leaving an unnecessary scrollbar.
  - Fix: tightened the workspace bottom spacing; final `scrollHeight` and `innerHeight` are both 1024 px.
- [P2] The hero warning used a triangular symbol and the sidebar omitted the visible team-switch action.
  - Fix: switched to a circular warning icon and restored the sidebar “切换团队” control.

### Final pass

- Full-view and focused comparisons show no remaining P0, P1, or P2 mismatch.
- [P3] The source uses slightly larger hero whitespace and a more pronounced completed-stage connector. The implementation retains a denser layout to keep the complete demo state visible at exactly 1440 × 1024.

## Implementation checklist

- [x] Desktop composition matches the selected concept.
- [x] Core risk-to-task workflow is interactive.
- [x] Responsive breakpoint is usable.
- [x] Console is free of errors.
- [x] All P0/P1/P2 issues are resolved.

## 2026-08-25 登录与多页面扩展复核

### Comparison target

- Core page visual references: `视频界面原型/01_赛项解析中心_生成界面.png` through `视频界面原型/06_赛后复盘_生成界面.png`
- Focused source visual truth: `视频界面原型/01_赛项解析中心_生成界面.png`
- Browser-rendered implementation: `qa-analysis-implementation.png`
- Full-view side-by-side evidence: `qa-analysis-comparison.png`（左：参考界面，右：浏览器实现）
- Viewport and CSS size: 1680 × 944 CSS px
- Device pixel ratio: 1
- Source pixels: 1680 × 944
- Implementation pixels: 1680 × 944
- Density normalization: none required; source and implementation use equal pixel dimensions and 1:1 CSS capture.
- State: `teacher` 指导教师已登录 / 赛项解析中心 / 默认已解析状态

### Evidence and findings

- Full-view comparison confirms the same deep-navy shell, fixed left navigation, three-step analysis flow, document column, five weighted criteria rows, confirmation summary, and blue/green/orange/violet semantic states.
- A separate focused crop was not required because the original 1680 × 944 comparison keeps labels, weights, status colors, document rows, and primary action legible. The previously recorded dashboard focused comparisons remain valid for progress rings and task/risk details.
- Fonts and typography: Noto Sans SC remains bundled; module titles, labels, weights, body copy and metadata preserve the current product hierarchy. No clipped or overlapping Chinese text was observed at the target viewport.
- Spacing and layout rhythm: the new page intentionally retains the current 224 px authenticated shell and adds a compact page-introduction row before the reference flow. The three-column content proportions and bottom alignment remain stable with no viewport clipping.
- Colors and visual tokens: all pages reuse the established navy, electric blue, completion green, risk orange, danger red and muted blue-gray tokens.
- Image quality and asset fidelity: business pages use Phosphor UI icons and existing raster progress assets; no emoji, placeholder image, handcrafted SVG or substituted logo was introduced.
- Copy and content: page labels, evaluation dimensions, evidence terminology, task stages and mock data are derived from the six reference screens and the project design document.
- [P2 resolved] At the collapsed sidebar breakpoint, hidden label text also removed accessible menu names. Added stable `aria-label` and `aria-current` attributes; the browser now resolves all nine navigation controls by name.
- [P3] The module page repeats its title below the persistent top bar to preserve orientation and provide a consistent location for the page description and primary action. This is an intentional integration difference from the standalone reference screen.

### Interaction verification

- Invalid password shows `账号或密码错误，请使用测试账号登录`.
- `teacher / 123456` opens the authenticated dashboard.
- All eight non-dashboard sidebar entries render a matching independent page heading.
- Refresh preserves the authenticated session.
- The account menu opens and closes when clicking outside.
- Logout clears the session and returns to `登录赛训智舱`.
- Final desktop console check returned zero errors.

### Comparison history

- Initial extension pass: all pages rendered and matched the selected visual system; browser inspection found the collapsed-navigation accessible-name issue.
- Fix: added explicit navigation labels and current-page semantics without changing layout.
- Post-fix evidence: all nine controls were identifiable, all eight business headings were reached, login lifecycle passed, and the console remained clean.
- No actionable P0, P1 or P2 findings remain.

final result: passed

---

## 时效说明（2026-10-04追加）

本文档是**2026-08~09 期间**以「方案 1（`reference-option-1.png`）」为基准做的界面比对记录，
所引用的截图（`implementation-*.png`、`qa-comparison-*.png`）均为**当时版本**，
不代表当前界面状态。

此后的界面演进（均有实测依据）：

| 时间 | 变更 | 影响 |
| --- | --- | --- |
| 2026-10-03 | 移除 `@fontsource/noto-sans-sc`（约 23MB 字体切片），改用系统字体栈 | 本文档中「Noto Sans SC 本地打包」的说法已失效 |
| 2026-10-03 | 进度环由 950KB 不透明 PNG 位图改为内联 SVG（`src/ProgressRing.jsx`） | 界面观感变化，详见 `问题排查清单-20261003.md` |
| 2026-10-03 | 清理浅色主题遗留样式，统一深色主题 | 诊断卡片由白底改为深底，看板按钮由浅灰改为语义深色 |
| 2026-10-04 | 顶栏日期改为系统实时日期；项目阶段接入 `Project.currentStage` | 阶段轨道随团队变化，不再固定「作品打磨」 |
| 2026-10-04 | 修复学生登录后仍停在教师端驾驶舱的问题 | 角色落地页正确 |

**当前界面的权威截图请看 `docs/readme-assets/`**（15 张，随每次界面变更重新抓取）。
