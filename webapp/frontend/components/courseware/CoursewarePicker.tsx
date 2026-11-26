"use client";

import { Modal } from '@/components/ui/modal';
import { CoursewareWorkspace, type CoursewareSelection } from './CoursewareWorkspace';
import type { PageSelection } from '@/types';
import styles from './CoursewareWorkspace.module.css';

export function coursewarePageSelection(pages: string): PageSelection {
  const contiguous = pages.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  return contiguous ? { pageStart: Number(contiguous[1]), pageEnd: Number(contiguous[2] ?? contiguous[1]) } : { complexRange: pages };
}
export interface CoursewarePickerProps {
  isOpen: boolean; onClose: () => void;
  onSelect: (path: string, pages?: PageSelection) => void;
  multiSelect?: boolean;
  onMultiSelect?: (files: { path: string; pageSelection?: PageSelection }[]) => void;
  exerciseType?: 'CW' | 'HW'; studentGrade?: string; school?: string; location?: string;
}
export function CoursewarePicker({ isOpen, onClose, onSelect, onMultiSelect, multiSelect = false, location, exerciseType, studentGrade, school }: CoursewarePickerProps) {
  if (!isOpen) return null;
  const pick = (files: CoursewareSelection[]) => {
    if (multiSelect && onMultiSelect) onMultiSelect(files.map(file => ({ path: file.path, pageSelection: coursewarePageSelection(file.pages) })));
    else if (files[0]) onSelect(files[0].path, coursewarePageSelection(files[0].pages));
    onClose();
  };
  return <Modal isOpen title="Courseware" size="2xl" className={styles.modal} onClose={onClose}>
    <CoursewareWorkspace location={location} exerciseType={exerciseType} grade={studentGrade} school={school} multiple={multiSelect && !!onMultiSelect} onPick={pick} />
  </Modal>;
}
