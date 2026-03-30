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
  const result: { folder: DocumentFolder; depth: number }[] = [];
  const walk = (nodes: FolderTreeNode[], depth: number) => {
    for (const node of nodes) {
      result.push({ folder: node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(buildFolderTree(folders), 0);
  return result;
}
