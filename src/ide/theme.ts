export interface IDETheme {
  activityBarBg: number[];
  activityBarFg: number[];
  activityBarActive: number[];
  activityBarHover: number[];
  activeTile: number[];
  activeTileGlow: number[];
  containerBg: number[];
  contentBg: number[];
  headerText: number[];
  sidebarTabActive: number[];
  sidebarTabFg: number[];
  sidebarTabActiveFg: number[];
  editorBg: number[];
  tabBarBg: number[];
  tabActiveBg: number[];
  tabFg: number[];
  tabActiveFg: number[];
  tabBorder: number[];
  statusbarBg: number[];
  statusbarFg: number[];
  border: number[];
  separator: number[];
  accent: number[];
  text: number[];
  dim: number[];
  searchBg: number[];
  searchBorder: number[];
  magnifier: number[];
  placeholder: number[];
}

export const ideTheme: IDETheme = {
  activityBarBg: [0.118, 0.118, 0.118, 1],
  activityBarFg: [0.8, 0.8, 0.8, 1],
  activityBarActive: [1, 1, 1, 1],
  activityBarHover: [1, 1, 1, 0.08],
  activeTile: [0.0, 0.478, 0.8, 1],
  activeTileGlow: [0.0, 0.478, 0.8, 0.5],
  containerBg: [0.145, 0.145, 0.149, 1],
  contentBg: [0.149, 0.149, 0.145, 1],
  headerText: [0.8, 0.8, 0.8, 1],
  sidebarTabActive: [0.118, 0.118, 0.118, 1],
  sidebarTabFg: [0.8, 0.8, 0.8, 1],
  sidebarTabActiveFg: [1, 1, 1, 1],
  editorBg: [0.118, 0.118, 0.118, 1],
  tabBarBg: [0.145, 0.145, 0.149, 1],
  tabActiveBg: [0.118, 0.118, 0.118, 1],
  tabFg: [0.533, 0.533, 0.533, 1],
  tabActiveFg: [0.92, 0.94, 0.98, 1],
  tabBorder: [0.251, 0.251, 0.251, 1],
  statusbarBg: [0.0, 0.478, 0.8, 1],
  statusbarFg: [1, 1, 1, 1],
  border: [0.2, 0.2, 0.2, 1],
  separator: [0.251, 0.251, 0.251, 1],
  accent: [0.0, 0.478, 0.8, 1],
  text: [0.8, 0.8, 0.8, 1],
  dim: [0.533, 0.533, 0.533, 1],
  searchBg: [0.118, 0.118, 0.118, 1],
  searchBorder: [0.251, 0.251, 0.251, 1],
  magnifier: [0.533, 0.533, 0.533, 1],
  placeholder: [0.533, 0.533, 0.533, 1],
};
