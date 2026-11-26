"use client";

import { CoursewareWorkspace } from '@/components/courseware/CoursewareWorkspace';
import { materialAliasPath } from '@/components/commandPalette/MaterialSearch';
import type { PreviewFile } from './ZenCoursewarePreview';

interface ZenCoursewareSearchProps {
  isActive: boolean;
  onSelectFile: (file: PreviewFile) => void;
  onAssignFile: (path: string, title: string) => void;
}
export function ZenCoursewareSearch({ isActive, onSelectFile, onAssignFile }: ZenCoursewareSearchProps) {
  return <CoursewareWorkspace active={isActive} multiple={false} externalPreview
    onPreview={file => onSelectFile({ path: materialAliasPath(file.nas_path), title: file.filename, source: 'courseware' })}
    onAssignResult={file => onAssignFile(materialAliasPath(file.nas_path), file.filename)} />;
}
