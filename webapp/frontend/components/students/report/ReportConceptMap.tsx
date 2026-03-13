import type { ConceptNode } from "@/types";
import { getConceptCategoryColors } from "@/lib/progress-constants";

interface ReportConceptMapProps {
  data: ConceptNode[];
}

export function ReportConceptMap({ data }: ReportConceptMapProps) {
  if (data.length === 0) return null;

  // Group by category
  const groups = new Map<string, ConceptNode[]>();
  for (const node of data) {
    const cat = node.category || "Other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(node);
  }

  // Sort categories by total count
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => b[1].reduce((s, n) => s + n.count, 0) - a[1].reduce((s, n) => s + n.count, 0)
  );

  const maxCount = Math.max(...data.map((n) => n.count), 1);

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Concepts Covered</h3>
      <div className="flex flex-wrap gap-4">
        {sortedGroups.map(([category, nodes]) => {
          const colors = getConceptCategoryColors(category);
          return (
            <div key={category} className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: colors.text }}>
                {category}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...nodes]
                  .sort((a, b) => b.count - a.count)
                  .map((node) => {
                    const scale = 0.6 + 0.4 * (node.count / maxCount);
                    return (
                      <div
                        key={node.label}
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                        style={{
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                          color: colors.text,
                          fontSize: `${Math.round(10 + 2 * scale)}px`,
                        }}
                      >
                        <span className="font-medium whitespace-nowrap">{node.label}</span>
                        {node.count > 1 && (
                          <span className="text-[9px] opacity-60">{node.count}x</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
