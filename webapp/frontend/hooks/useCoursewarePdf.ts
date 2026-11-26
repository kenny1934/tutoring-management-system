"use client";
import { useEffect, useState } from 'react';
import { loadCoursewarePdf, type CoursewarePdf } from '@/lib/courseware-pdf';

export function useCoursewarePdf(path: string, fileId?: number, scope?: string) {
  const identity = JSON.stringify([path, fileId, scope]);
  const [retry, setRetry] = useState({ identity, attempt: 0 });
  const attempt = retry.identity === identity ? retry.attempt : 0;
  const setAttempt = (value: number) => setRetry({ identity, attempt: value });
  const [state, setState] = useState<{ key: string; data?: CoursewarePdf; error?: string }>({ key: '' });
  const key = JSON.stringify([path, fileId, scope, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    void loadCoursewarePdf({ path, fileId, scope, signal: controller.signal, refresh: attempt > 0, localFirst: attempt === 0 }).then(
      data => { if (!controller.signal.aborted) setState({ key, data }); },
      error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'The PDF could not load.' }); },
    );
    return () => controller.abort();
  }, [path, fileId, scope, key, attempt]);
  const current = state.key === key ? state : undefined;
  return { data: current?.data, error: current?.error ?? null, isLoading: !current?.data && !current?.error,
    retry: () => setAttempt(attempt + 1), recoverLocal: () => { if (current?.data?.source === 'local' && attempt === 0) setAttempt(1); } };
}
