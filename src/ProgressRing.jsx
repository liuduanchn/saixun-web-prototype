// 进度环（SVG）
//
// 此前用两张 950KB 的**不透明PNG 位图**表示进度，存在三个问题：
//   1. 以绝对路径 /assets/xxx.png 引用，不带 Vite base，
//      在GitHub Pages 子路径部署下必然 404；
//   2. PNG 中央的深蓝底色与面板底色 --surface:#071d3c 几乎相同，
//      叠在上面的数字对比度不足，看起来「数字和背景一个颜色」；
//   3. 环的进度是画死的，真实覆盖率 60% / 73% / 80% 全都显示同一张图。
//
// 改为内联SVG 后：随Vite 打包自动处理 base、底色透明由CSS 变量控制、
// 进度由真实数据驱动。

/**
 * @param {number} value      当前值
 * @param {number} max        满分
 * @param {string} accent     主色（CSS 颜色值）
 * @param {number} size       直径（px）
 * @param {string} trackColor 轨道色；默认走 --line
 */
export function ProgressRing({
  value,
  max = 100,
  accent = "var(--green)",
  size = 122,
  trackColor = "var(--line)",
  strokeWidth = 11,
  children,
}) {
  const safeMax = Number(max) > 0 ? Number(max) : 100;
  const raw = Number(value);
  const safeValue = Number.isFinite(raw) ? Math.max(0, Math.min(safeMax, raw)) : 0;
  const percent = (safeValue / safeMax) * 100;

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  // round 上限让环“走满”时也能看出接缝
  const dash = (percent / 100) * c;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          // 从 12 点方向顺时针增长
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray .45s ease" }}
        />
      </svg>
      {children != null && <div className="ring-center">{children}</div>}
    </div>
  );
}
