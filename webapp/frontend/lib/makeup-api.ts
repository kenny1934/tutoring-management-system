import { fetchAPI } from '@/lib/api';
import type { ParticipationChange, ParticipationDetail, ParticipationPreview } from '@/types/makeup';

export const makeupAPI = {
  participation: (studentId: number, tutorId?: number, signal?: AbortSignal) => fetchAPI<ParticipationDetail>(`/billing/students/${studentId}/participation${tutorId ? `?tutor_id=${tutorId}` : ''}`, { signal }),
  previewParticipation: (studentId: number, change: ParticipationChange, signal?: AbortSignal) => fetchAPI<ParticipationPreview>(`/billing/students/${studentId}/participation/preview`, { method: 'POST', body: JSON.stringify(change), signal }),
  changeParticipation: (studentId: number, data: ParticipationChange & { expected_version: number; expected_review_hash: string; idempotency_key: string }, signal?: AbortSignal) => fetchAPI<ParticipationDetail>(`/billing/students/${studentId}/participation`, { method: 'POST', body: JSON.stringify(data), signal }),
};
