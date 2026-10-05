/**
 * 品牌标识（闭环驱动）—— 内联 SVG 组件
 * ------------------------------------------------------------------
 * 几何与配色来源：国赛备赛/陈哲视频/成片/logo/LogoC_闭环驱动_同源深色.svg
 *
 * 为什么内联而不放 public/ 走 <img>：
 *   1. 本仓存在两种部署基路径（GitHub Pages 的 /saixun-web-prototype/ 与
 *      WorkBuddy 的单端口 /），静态资源的 URL 前缀必须跟着 base 走，
 *      内联则完全不受影响；
 *   2. 尺寸只有三个（侧边栏 38 / 登录页 30 / favicon 独立一份），
 *      内联省掉 3 个额外请求，且颜色可用 CSS 变量统一调整。
 *
 * 为什么用「同源深色」版而不是「浅底透明」版：
 *   浅底透明版的圆环是深紫 #2A2358，在系统深色底（侧边栏 #04162f、
 *   页面 #03132b）上对比度仅 1.27:1，肉眼几乎不可见（图形元素需 ≥3:1）。
 *   同源深色版把环换成白色 55%（约 6.1:1），方块/箭头用品牌品红，
 *   并自带深紫圆角容器，深底上完全成立。
 *
 * 注意：viewBox 固定 240×240（与源文件一致），不要单独缩放内部坐标。
 */

/**
 * @param {number}  size   边长（px）
 * @param {boolean} plate  是否绘制深紫圆角容器；favicon 与深底场景需要，
 *                         浅底或极窄空间（如折叠态微缩）可关闭
 * @param {string}  label  无障碍名称
 */
export function BrandLogo({ size = 38, plate = true, label = "赛训智舱" }) {
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      focusable="false"
      className="brand-logo"
    >
      <title>{label}</title>
      {plate && <rect x="16" y="16" width="208" height="208" rx="52" fill="var(--brand-plate)" />}
      <path
        d="M178.3 98.8 A62 62 0 1 1 141.2 61.7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.55"
      />
      <rect x="103" y="103" width="34" height="34" rx="10" fill="var(--brand-magenta)" />
      <polygon
        points="-9,-9 11,0 -9,9"
        transform="translate(163.8 76.2) rotate(45)"
        fill="var(--brand-magenta)"
      />
    </svg>
  );
}
