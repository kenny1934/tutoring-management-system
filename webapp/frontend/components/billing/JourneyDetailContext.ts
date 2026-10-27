'use client';

import { createContext, useContext } from 'react';

/** A detail action can use the current phone sheet instead of opening a second dialog. */
export const JourneyDetailContext = createContext<{
  inDialog: boolean;
  active: boolean;
  setReviewing: (reviewing: boolean) => void;
  setBusy?: (busy: boolean) => void;
  closeDetails?: () => void;
} | null>(null);

export const useJourneyDetail = () => useContext(JourneyDetailContext);
