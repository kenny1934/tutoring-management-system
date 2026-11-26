"use client";

import { useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { MaterialSearch, materialAliasPath, type CoursewareSelection, type MaterialResult } from '@/components/commandPalette/MaterialSearch';
import { createMaterialWorkspace } from '@/components/commandPalette/material-workspace';
import { CoursewareStart, useRecentCourseware } from './CoursewareStart';
import styles from './CoursewareWorkspace.module.css';

export type { CoursewareSelection };
type Props = {
  active?: boolean; multiple?: boolean; location?: string; exerciseType?: 'CW' | 'HW'; grade?: string; school?: string; emptyState?: ReactNode;
  onPick?: (files: CoursewareSelection[]) => void;
  onPreview?: (file: MaterialResult) => void;
  onAssignResult?: (file: MaterialResult) => void;
  externalPreview?: boolean;
};

/** Every courseware entry point shares the console's query, filters and reader. */
export function CoursewareWorkspace(props: Props) {
  const { user, effectiveRole, isImpersonating, impersonatedTutor, isReadOnly } = useAuth();
  const { selectedLocation } = useLocation();
  const scope = `${user?.id}:${effectiveRole}:${isImpersonating ? impersonatedTutor?.id : ''}:${props.location ?? selectedLocation}`;
  return <Workspace key={scope} {...props} scope={scope} canAssign={!isReadOnly} />;
}
function Workspace({ scope, canAssign, active = true, ...props }: Props & { scope: string; canAssign: boolean }) {
  const [query, setQuery] = useState('');
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const workspace = useRef(createMaterialWorkspace());
  const recent = useRecentCourseware(scope);
  return <div className={styles.workspace} data-courseware-workspace onKeyDown={event => { if (event.key !== 'Escape' && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) event.stopPropagation(); }}>
    <div className={styles.header}>
      <label className={styles.query}><Search size={17} aria-hidden /><input aria-label="Search courseware" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search courseware" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      <div ref={setToolbar} className={styles.tools} />
    </div>
    <MaterialSearch {...props} active={active} scope={scope} query={query} onQueryChange={setQuery} toolbarHost={toolbar} workspace={workspace.current} canAssign={canAssign}
      emptyState={props.emptyState ?? <CoursewareStart recent={recent} exerciseType={props.exerciseType} grade={props.grade} school={props.school} location={props.location} onFind={path => setQuery(path.split(/[\\/]/).at(-1) || path)} />}
      onPreview={file => { recent.remember({ path: materialAliasPath(file.nas_path), title: file.filename }); props.onPreview?.(file); }}
      onPick={props.onPick ? files => { files.forEach(recent.remember); props.onPick?.(files); } : undefined} />
  </div>;
}
