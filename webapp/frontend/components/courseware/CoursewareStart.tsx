"use client";
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { IconButton } from '@/components/controls';
import { PdfPreviewModal } from '@/components/ui/pdf-preview-modal';
import { TrendingCoursewareSection } from '@/components/sessions/TrendingCoursewareSection';
import type { CoursewareSelection } from './CoursewareWorkspace';
import styles from './CoursewareWorkspace.module.css';
type RecentFile = Pick<CoursewareSelection, 'path' | 'title'>;
const key = (scope: string) => `courseware-recent-files:${scope}`;
function read(scope: string): RecentFile[] {
  try {
    const files: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? '[]');
    return Array.isArray(files) ? files.filter((file): file is RecentFile => !!file && typeof file.path === 'string' && file.path.length <= 2048 && typeof file.title === 'string' && file.title.length <= 512).slice(0, 10) : [];
  } catch { return []; }
}
/** Keep recent paths within the same account, role and centre as search history. */
export function useRecentCourseware(scope: string) {
  const [files, setFiles] = useState(() => read(scope));
  return { files, remember: (file: RecentFile) => {
    const next = [file, ...read(scope).filter(item => item.path.toLowerCase() !== file.path.toLowerCase())].slice(0, 10);
    try { localStorage.setItem(key(scope), JSON.stringify(next)); } catch { /* Selection works without browser storage. */ }
    setFiles(next);
  }, clear: () => { try { localStorage.removeItem(key(scope)); } catch { /* Storage may be disabled. */ } setFiles([]); } };
}
export function CoursewareStart({ recent, onFind, exerciseType, grade, school, location }: {
  recent: ReturnType<typeof useRecentCourseware>; onFind: (path: string) => void;
  exerciseType?: 'CW' | 'HW'; grade?: string; school?: string; location?: string;
}) {
  const [preview, setPreview] = useState<RecentFile | null>(null);
  return <div className={styles.start}>
    {!!recent.files.length && <section aria-label="Recent courseware files">
      <div className={styles.recentHeader}><span>Recent files</span><button onClick={recent.clear}>Clear</button></div>
      {recent.files.map(file => <div key={file.path} className={styles.recentFile}>
        <button onClick={() => onFind(file.path)} title={file.path}>{file.title}</button>
        <IconButton label={`Preview ${file.title}`} icon={Eye} size="sm" onClick={() => setPreview(file)} />
      </div>)}
    </section>}
    <TrendingCoursewareSection exerciseType={exerciseType} grade={grade} school={school} location={location} onAdd={onFind} />
    <PdfPreviewModal isOpen={!!preview} onClose={() => setPreview(null)} documentId={null} sourcePath={preview?.path} documentTitle={preview?.title} />
  </div>;
}
