// ── IDE context menus ────────────────────────────────────────────────────────
// Declarative right-click menus for the IDE demo, built on the GPU-rendered
// AnalyticContextMenu (src/ui/analyticMenu.ts) — zero DOM, same pipeline as
// everything else.
//
// Architecture:
//  - Each menu SURFACE (tab, tree folder, tree file, editor, terminal) has one
//    pure builder below: (actions, small context) → MenuItem[].
//  - Builders never touch IDE state directly; every capability is a callback on
//    IdeMenuActions, implemented once in ide.ts as closures over its locals.
//
// Extending:
//  - new item    → append a MenuItem to the relevant builder
//  - new action  → declare it on IdeMenuActions + implement it in ide.ts
//  - new surface → add a builder here + a hit-test branch in ide.ts's
//                  onContextMenu (see the "Context menu routing" comment there)

import type { AnalyticMenuItem } from '../ui/analyticMenu';
import type { TreeNode } from '../editor/fileTree';

// Every capability any IDE menu may invoke.
export interface IdeMenuActions {
  // ── Tabs ──
  closeTab(index: number): void;
  closeOtherTabs(index: number): void;
  closeTabsToRight(index: number): void;
  // ── File tree ──
  openFile(node: TreeNode): void;
  toggleFolder(path: string): void;
  newFileIn(folder: TreeNode): void;
  newFolderIn(folder: TreeNode): void;
  renameNode(node: TreeNode): void;
  deleteNode(node: TreeNode): void;
  copyPath(path: string): void;
  // ── Code editor ──
  canUndo(): boolean;
  canRedo(): boolean;
  hasSelection(): boolean;
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  formatDocument(): void;
  toggleComment(): void;
  selectAll(): void;
  // ── Terminal ──
  clearTerminal(): void;
  closeTerminal(): void;
  // ── Search box ──
  hasQuery(): boolean;
  cutQuery(): void;
  copyQuery(): void;
  pasteQuery(): void;
  clearQuery(): void;
}

// Editor tab strip. `tabCount` drives the enabled-state of the bulk closes.
export function tabMenu(a: IdeMenuActions, index: number, tabCount: number): AnalyticMenuItem[] {
  return [
    { id: 'close', label: 'Close', icon: 'icon:cross', shortcut: 'Ctrl+W', action: () => a.closeTab(index) },
    { id: 'closeOthers', label: 'Close Others', icon: 'icon:closeOthers', enabled: () => tabCount > 1, action: () => a.closeOtherTabs(index) },
    { id: 'closeRight', label: 'Close to the Right', icon: 'icon:closeRight', enabled: () => index < tabCount - 1, action: () => a.closeTabsToRight(index) },
  ];
}

// Folder row in the file tree. `expanded` picks the collapse/expand wording.
export function folderMenu(a: IdeMenuActions, node: TreeNode, expanded: boolean): AnalyticMenuItem[] {
  return [
    { id: 'newFile', label: 'New File…', icon: 'icon:filePlus', action: () => a.newFileIn(node) },
    { id: 'newFolder', label: 'New Folder…', icon: 'icon:folderPlus', action: () => a.newFolderIn(node) },
    { id: 'sep1', separator: true },
    { id: 'toggle', label: expanded ? 'Collapse Folder' : 'Expand Folder', icon: expanded ? 'icon:chevron' : 'icon:chevronRight', action: () => a.toggleFolder(node.path) },
    { id: 'sep2', separator: true },
    { id: 'copyPath', label: 'Copy Path', icon: 'icon:link', action: () => a.copyPath(node.path) },
    { id: 'rename', label: 'Rename…', icon: 'icon:pencil', shortcut: 'F2', action: () => a.renameNode(node) },
    { id: 'delete', label: 'Delete', icon: 'icon:trash', shortcut: 'Del', action: () => a.deleteNode(node) },
  ];
}

// File row in the file tree.
export function fileMenu(a: IdeMenuActions, node: TreeNode): AnalyticMenuItem[] {
  return [
    { id: 'open', label: 'Open', icon: 'icon:external', action: () => a.openFile(node) },
    { id: 'sep1', separator: true },
    { id: 'copyPath', label: 'Copy Path', icon: 'icon:link', action: () => a.copyPath(node.path) },
    { id: 'rename', label: 'Rename…', icon: 'icon:pencil', shortcut: 'F2', action: () => a.renameNode(node) },
    { id: 'delete', label: 'Delete', icon: 'icon:trash', shortcut: 'Del', action: () => a.deleteNode(node) },
  ];
}

// Code editor body.
export function editorMenu(a: IdeMenuActions): AnalyticMenuItem[] {
  return [
    { id: 'undo', label: 'Undo', icon: 'icon:undo', shortcut: 'Ctrl+Z', enabled: () => a.canUndo(), action: () => a.undo() },
    { id: 'redo', label: 'Redo', icon: 'icon:redo', shortcut: 'Ctrl+Y', enabled: () => a.canRedo(), action: () => a.redo() },
    { id: 'sep1', separator: true },
    { id: 'cut', label: 'Cut', icon: 'icon:cut', shortcut: 'Ctrl+X', enabled: () => a.hasSelection(), action: () => a.cut() },
    { id: 'copy', label: 'Copy', icon: 'icon:copy', shortcut: 'Ctrl+C', enabled: () => a.hasSelection(), action: () => a.copy() },
    { id: 'paste', label: 'Paste', icon: 'icon:paste', shortcut: 'Ctrl+V', action: () => a.paste() },
    { id: 'sep2', separator: true },
    { id: 'format', label: 'Format Document', icon: 'icon:format', shortcut: 'Shift+Alt+F', action: () => a.formatDocument() },
    { id: 'comment', label: 'Toggle Line Comment', icon: 'icon:comment', shortcut: 'Ctrl+/', action: () => a.toggleComment() },
    { id: 'sep3', separator: true },
    { id: 'selectAll', label: 'Select All', icon: 'icon:selectAll', shortcut: 'Ctrl+A', action: () => a.selectAll() },
  ];
}

// Sidebar search box. The query is a single line with no selection model, so
// cut/copy always act on the whole query and paste appends at the end.
export function searchMenu(a: IdeMenuActions): AnalyticMenuItem[] {
  return [
    { id: 'cut', label: 'Cut', icon: 'icon:cut', shortcut: 'Ctrl+X', enabled: () => a.hasQuery(), action: () => a.cutQuery() },
    { id: 'copy', label: 'Copy', icon: 'icon:copy', shortcut: 'Ctrl+C', enabled: () => a.hasQuery(), action: () => a.copyQuery() },
    { id: 'paste', label: 'Paste', icon: 'icon:paste', shortcut: 'Ctrl+V', action: () => a.pasteQuery() },
    { id: 'sep1', separator: true },
    { id: 'clear', label: 'Clear', icon: 'icon:cross', enabled: () => a.hasQuery(), action: () => a.clearQuery() },
  ];
}

// Terminal body.
export function terminalMenu(a: IdeMenuActions): AnalyticMenuItem[] {
  return [
    { id: 'clear', label: 'Clear', icon: 'icon:eraser', shortcut: 'Ctrl+L', action: () => a.clearTerminal() },
    { id: 'sep1', separator: true },
    { id: 'close', label: 'Close Terminal', icon: 'icon:terminalIcon', shortcut: 'Ctrl+`', action: () => a.closeTerminal() },
  ];
}
