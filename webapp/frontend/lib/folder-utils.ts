import type { DocumentFolder } from "@/types";

export interface FolderTreeNode extends DocumentFolder {
  children: FolderTreeNode[];
}

/** Build a tree from a flat folder list. */
export function buildFolderTree(folders: DocumentFolder[]): FolderTreeNode[] {
  const map = new Map<number, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

/** Flatten a folder list into depth-annotated entries for rendering in dropdowns. */
export function flattenFolderTree(folders: DocumentFolder[]): { folder: DocumentFolder; depth: number }[] {
  const map = new Map<number, DocumentFolder[]>();
  const roots: DocumentFolder[] = [];
  for (const f of folders) {
    if (f.parent_id && folders.some(p => p.id === f.parent_id)) {
      const siblings = map.get(f.parent_id) || [];
      siblings.push(f);
      map.set(f.parent_id, siblings);
    } else {
      roots.push(f);
    }
  }
  const result: { folder: DocumentFolder; depth: number }[] = [];
  const visited = new Set<number>();
  const walk = (items: DocumentFolder[], depth: number) => {
    for (const f of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (visited.has(f.id)) continue;
      visited.add(f.id);
      result.push({ folder: f, depth });
      const children = map.get(f.id);
      if (children) walk(children, depth + 1);
    }
  };
  walk(roots, 0);
  return result;
}
