// ── Type declarations for the Taffy WASM bridge ──────────────────────────────
export class TaffyBridge {
  new_node(): number;
  add_child(parent: number, child: number): boolean;
  remove(id: number): boolean;
  set_style(id: number, style_json: string): boolean;
  compute_layout(root: number, aw: number, ah: number): string;
  node_count(): number;
  clear(): void;
  free(): void;
}

export function initSync(module_or_path?: any): void;
export default function __wbg_init(module_or_path?: any): Promise<void>;
