// ── IDE context menus ────────────────────────────────────────────────────────
// Declarative right-click menus for the IDE demo, built on the shared DOM
// ContextMenu (src/ui/contextMenu.ts) — the same system the playground uses.
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

import type { MenuItem } from '../ui/contextMenu';
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
}

// Editor tab strip. `tabCount` drives the enabled-state of the bulk closes.
export function tabMenu(a: IdeMenuActions, index: number, tabCount: number): MenuItem[] {
  return [
    { id: 'close', label: 'Close', icon: 'close', shortcut: 'Ctrl+W', action: () => a.closeTab(index) },
    { id: 'closeOthers', label: 'Close Others', icon: 'closeOthers', enabled: () => tabCount > 1, action: () => a.closeOtherTabs(index) },
    { id: 'closeRight', label: 'Close to the Right', icon: 'closeRight', enabled: () => index < tabCount - 1, action: () => a.closeTabsToRight(index) },
  ];
}

// Folder row in the file tree. `expanded` picks the collapse/expand wording.
export function folderMenu(a: IdeMenuActions, node: TreeNode, expanded: boolean): MenuItem[] {
  return [
    { id: 'newFile', label: 'New File…', icon: 'filePlus', action: () => a.newFileIn(node) },
    { id: 'newFolder', label: 'New Folder…', icon: 'folderPlus', action: () => a.newFolderIn(node) },
    { id: 'sep1', separator: true },
    { id: 'toggle', label: expanded ? 'Collapse Folder' : 'Expand Folder', icon: expanded ? 'chevronDown' : 'chevronRight', action: () => a.toggleFolder(node.path) },
    { id: 'sep2', separator: true },
    { id: 'copyPath', label: 'Copy Path', icon: 'link', action: () => a.copyPath(node.path) },
    { id: 'rename', label: 'Rename…', icon: 'pencil', shortcut: 'F2', action: () => a.renameNode(node) },
    { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Del', action: () => a.deleteNode(node) },
  ];
}

// File row in the file tree.
export function fileMenu(a: IdeMenuActions, node: TreeNode): MenuItem[] {
  return [
    { id: 'open', label: 'Open', icon: 'external', action: () => a.openFile(node) },
    { id: 'sep1', separator: true },
    { id: 'copyPath', label: 'Copy Path', icon: 'link', action: () => a.copyPath(node.path) },
    { id: 'rename', label: 'Rename…', icon: 'pencil', shortcut: 'F2', action: () => a.renameNode(node) },
    { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Del', action: () => a.deleteNode(node) },
  ];
}

// Code editor body.
export function editorMenu(a: IdeMenuActions): MenuItem[] {
  return [
    { id: 'undo', label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', enabled: () => a.canUndo(), action: () => a.undo() },
    { id: 'redo', label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', enabled: () => a.canRedo(), action: () => a.redo() },
    { id: 'sep1', separator: true },
    { id: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', enabled: () => a.hasSelection(), action: () => a.cut() },
    { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', enabled: () => a.hasSelection(), action: () => a.copy() },
    { id: 'paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', action: () => a.paste() },
    { id: 'sep2', separator: true },
    { id: 'format', label: 'Format Document', icon: 'format', shortcut: 'Shift+Alt+F', action: () => a.formatDocument() },
    { id: 'comment', label: 'Toggle Line Comment', icon: 'comment', shortcut: 'Ctrl+/', action: () => a.toggleComment() },
    { id: 'sep3', separator: true },
    { id: 'selectAll', label: 'Select All', icon: 'selectAll', shortcut: 'Ctrl+A', action: () => a.selectAll() },
  ];
}

// Terminal body.
export function terminalMenu(a: IdeMenuActions): MenuItem[] {
  return [
    { id: 'clear', label: 'Clear', icon: 'eraser', shortcut: 'Ctrl+L', action: () => a.clearTerminal() },
    { id: 'sep1', separator: true },
    { id: 'close', label: 'Close Terminal', icon: 'terminal', shortcut: 'Ctrl+`', action: () => a.closeTerminal() },
  ];
}
