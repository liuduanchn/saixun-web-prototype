export function getSidebarPresentation(collapsed) {
  return {
    shellClassName: collapsed ? "app-shell sidebar-collapsed" : "app-shell",
    toggleLabel: collapsed ? "展开导航" : "收起导航",
    togglePressed: collapsed,
  };
}
