use taffy::prelude::*;
use wasm_bindgen::prelude::*;

// ── Taffy WASM bridge — exposes CSS Flexbox + Grid + Block layout to TypeScript ──

#[wasm_bindgen]
pub struct TaffyBridge {
    tree: TaffyTree<()>,
    nodes: Vec<NodeId>,
}

#[wasm_bindgen]
impl TaffyBridge {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            tree: TaffyTree::new(),
            nodes: Vec::new(),
        }
    }

    /// Create a new layout node, returning its ID (index into the nodes vec).
    pub fn new_node(&mut self) -> usize {
        let node = self.tree.new_leaf(Style::default()).unwrap();
        let id = self.nodes.len();
        self.nodes.push(node);
        id
    }

    /// Remove a node and all its children.
    pub fn remove(&mut self, id: usize) -> bool {
        if let Some(&node) = self.nodes.get(id) {
            let _ = self.tree.remove(node);
            self.nodes[id] = NodeId::from(0usize); // invalidate
            true
        } else {
            false
        }
    }

    /// Add `child` as a child of `parent`.
    pub fn add_child(&mut self, parent: usize, child: usize) -> bool {
        match (self.nodes.get(parent), self.nodes.get(child)) {
            (Some(&p), Some(&c)) => self.tree.add_child(p, c).is_ok(),
            _ => false,
        }
    }

    /// Set the style on a node from a JSON string.
    pub fn set_style(&mut self, id: usize, style_json: &str) -> bool {
        let node = match self.nodes.get(id) {
            Some(&n) => n,
            None => return false,
        };
        let style: Style = match serde_json::from_str(style_json) {
            Ok(s) => s,
            Err(_) => return false,
        };
        self.tree.set_style(node, style).is_ok()
    }

    /// Compute layout for the tree rooted at `root`, with given available space.
    /// Returns a JSON array of `[id, x, y, width, height]` for all nodes.
    pub fn compute_layout(&mut self, root: usize, available_width: f64, available_height: f64) -> String {
        let root_node = match self.nodes.get(root) {
            Some(&n) => n,
            None => return "[]".to_string(),
        };
        let avail = Size {
            width: if available_width.is_finite() { AvailableSpace::Definite(available_width as f32) } else { AvailableSpace::MaxContent },
            height: if available_height.is_finite() { AvailableSpace::Definite(available_height as f32) } else { AvailableSpace::MaxContent },
        };
        let _ = self.tree.compute_layout(root_node, avail);

        let mut results: Vec<[f64; 5]> = Vec::new();
        for (id, &node) in self.nodes.iter().enumerate() {
            if node == NodeId::from(0usize) { continue; }
            if let Ok(layout) = self.tree.layout(node) {
                results.push([
                    id as f64,
                    layout.location.x as f64,
                    layout.location.y as f64,
                    layout.size.width as f64,
                    layout.size.height as f64,
                ]);
            }
        }

        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get the serialized form of the default style (for debugging deserialization format).
    pub fn sample_style_json(&self) -> String {
        serde_json::to_string(&Style::default()).unwrap_or_else(|_| "{}".to_string())
    }
        self.nodes.iter().filter(|&&n| n != NodeId::from(0usize)).count()
    }

    /// Remove all nodes and reset.
    pub fn clear(&mut self) {
        self.tree.clear();
        self.nodes.clear();
    }
}

#[wasm_bindgen(start)]
pub fn _start() {}
