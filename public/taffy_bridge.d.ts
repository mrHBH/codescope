/* tslint:disable */
/* eslint-disable */

export class TaffyBridge {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add `child` as a child of `parent`.
     */
    add_child(parent: number, child: number): boolean;
    /**
     * Remove all nodes and reset.
     */
    clear(): void;
    /**
     * Compute layout for the tree rooted at `root`, with given available space.
     * Returns a JSON array of `[id, x, y, width, height]` for all nodes.
     */
    compute_layout(root: number, available_width: number, available_height: number): string;
    constructor();
    /**
     * Create a new layout node, returning its ID (index into the nodes vec).
     */
    new_node(): number;
    /**
     * Get the total number of valid (non-removed) nodes in the tree.
     */
    node_count(): number;
    /**
     * Remove a node and all its children.
     */
    remove(id: number): boolean;
    /**
     * Set the style on a node from a JSON string.
     */
    set_style(id: number, style_json: string): boolean;
}

export function _start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_taffybridge_free: (a: number, b: number) => void;
    readonly _start: () => void;
    readonly taffybridge_add_child: (a: number, b: number, c: number) => number;
    readonly taffybridge_clear: (a: number) => void;
    readonly taffybridge_compute_layout: (a: number, b: number, c: number, d: number) => [number, number];
    readonly taffybridge_new: () => number;
    readonly taffybridge_new_node: (a: number) => number;
    readonly taffybridge_node_count: (a: number) => number;
    readonly taffybridge_remove: (a: number, b: number) => number;
    readonly taffybridge_set_style: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
