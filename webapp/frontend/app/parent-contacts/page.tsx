"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTutors, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { ContactStatusBadge } from "@/components/parent-contacts/ContactStatusBadge";
import { StudentContactList } from "@/components/parent-contacts/StudentContactList";
import { ContactCalendar } from "@/components/parent-contacts/ContactCalendar";
import { ContactDetailPanel } from "@/components/parent-contacts/ContactDetailPanel";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { PendingFollowupsSection } from "@/components/parent-contacts/PendingFollowupsSection";
import { ContactStatsBar } from "@/components/parent-contacts/ContactStatsBar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { parentCommunicationsAPI, type ParentCommunication, type StudentContactStatus } from "@/lib/api";
import { Phone, Plus, Loader2, LayoutList, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";

export default function ParentContactsPage() {
  usePageTitle("Parent Contacts");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { data: tutors = [] } = useTutors();
  const { showToast } = useToast();
  const { user, isAdmin, canViewAdminPages, isReadOnly, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();

  // Calculate current tutor ID (respects impersonation)
  const currentTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id;
  }, [isImpersonating, effectiveRole, impersonatedTutor?.id, user?.id]);

  // State from URL params
  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(() => {
    const tutor = searchParams.get('tutor');
    if (tutor === 'all') return ALL_TUTORS;
    return tutor ? parseInt(tutor) : null;
  });

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(() => {
    const student = searchParams.get('student');
    return student ? parseInt(student) : null;
  });

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ParentCommunication | null>(null);
  const [modalPreselectedStudentId, setModalPreselectedStudentId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'list' | 'calendar' | 'details'>('list');

  // Calendar date range state
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');

  // Contact type filter state
  const [activeContactTypes, setActiveContactTypes] = useState<Set<string>>(
    new Set(['Progress Update', 'Concern', 'General'])
  );

  // Search state (debounced for backend notes search)
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Calculate date range for calendar
  const { startDate, endDate } = useMemo(() => {
    const start = new Date(calendarDate);
    const end = new Date(calendarDate);

    if (calendarView === 'day') {
      // Just the selected day
    } else if (calendarView === 'week') {
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      end.setDate(start.getDate() + 6);
    } else {
      // Month view - include full weeks
      start.setDate(1);
      start.setDate(start.getDate() - start.getDay());
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setDate(end.getDate() + (6 - end.getDay()));
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [calendarDate, calendarView]);

  // Determine effective tutor ID for API calls
  const effectiveTutorId = useMemo(() => {
    if (selectedTutorId === ALL_TUTORS) return undefined;
    if (typeof selectedTutorId === 'number') return selectedTutorId;
    return undefined;
  }, [selectedTutorId]);

  // Determine effective location
  const effectiveLocation = useMemo(() => {
    return selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  }, [selectedLocation]);

  // Show location prefix when viewing all locations
  const showLocationPrefix = !selectedLocation || selectedLocation === "All Locations";

  // Fetch student statuses
  const { data: studentStatuses = [], isLoading: loadingStatuses, error: statusError } = useSWR(
    ['parent-communications-students', effectiveTutorId, effectiveLocation, debouncedSearch],
    () => parentCommunicationsAPI.getStudentStatuses(effectiveTutorId, effectiveLocation, debouncedSearch || undefined),
    { revalidateOnFocus: false }
  );

  // Fetch calendar events
  const { data: calendarEvents = [], isLoading: loadingCalendar } = useSWR(
    ['parent-communications-calendar', startDate, endDate, effectiveTutorId, effectiveLocation],
    () => parentCommunicationsAPI.getCalendarEvents(startDate, endDate, effectiveTutorId, effectiveLocation),
    { revalidateOnFocus: false }
  );

  // Fetch pending follow-ups
  const { data: pendingFollowups = [] } = useSWR(
    ['parent-communications-followups', effectiveTutorId, effectiveLocation],
    () => parentCommunicationsAPI.getPendingFollowups(effectiveTutorId, effectiveLocation),
    { revalidateOnFocus: false }
  );

  // Fetch communication stats
  const { data: communicationStats, isLoading: loadingStats } = useSWR(
    ['parent-communications-stats', effectiveTutorId, effectiveLocation],
    () => parentCommunicationsAPI.getStats(effectiveTutorId, effectiveLocation),
    { revalidateOnFocus: false }
  );

  // Filter calendar events by active contact types
  const filteredCalendarEvents = useMemo(() => {
    return calendarEvents.filter(e => activeContactTypes.has(e.contact_type));
  }, [calendarEvents, activeContactTypes]);

  const toggleContactType = (type: string) => {
    setActiveContactTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Force tutor ID based on role
  useEffect(() => {
    if (!canViewAdminPages && currentTutorId) {
      // Non-admins always see their own data
      setSelectedTutorId(currentTutorId);
    } else if (canViewAdminPages && viewMode === 'my-view' && currentTutorId) {
      // Admin-level users in my-view default to their own data
      setSelectedTutorId(currentTutorId);
    } else if (canViewAdminPages && viewMode === 'center-view') {
      // Admin-level users in center-view reset to all tutors
      setSelectedTutorId(ALL_TUTORS);
    }
  }, [canViewAdminPages, viewMode, currentTutorId]);

  // Debounce search query for backend notes search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(studentSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [studentSearchQuery]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTutorId === ALL_TUTORS) {
      params.set('tutor', 'all');
    } else if (typeof selectedTutorId === 'number') {
      params.set('tutor', selectedTutorId.toString());
    }
    if (selectedStudentId) {
      params.set('student', selectedStudentId.toString());
    }
    const query = params.toString();
    router.replace(`/parent-contacts${query ? `?${query}` : ''}`, { scroll: false });
  }, [selectedTutorId, selectedStudentId, router]);

  // Refresh all data
  const refreshData = () => {
    mutate(['parent-communications-students', effectiveTutorId, effectiveLocation, debouncedSearch]);
    mutate(['parent-communications-calendar', startDate, endDate, effectiveTutorId, effectiveLocation]);
    mutate(['parent-communications-followups', effectiveTutorId, effectiveLocation]);
    mutate(['parent-communications-stats', effectiveTutorId, effectiveLocation]);
    if (selectedStudentId) {
      mutate(['student-contact-history', selectedStudentId]);
    }
  };

  // Handle record contact
  const handleRecordContact = (studentId?: number) => {
    setEditingContact(null);
    setModalPreselectedStudentId(studentId || null);
    setShowRecordModal(true);
  };

  // Handle edit contact
  const handleEditContact = (contact: ParentCommunication) => {
    setEditingContact(contact);
    setModalPreselectedStudentId(contact.student_id);
    setShowRecordModal(true);
  };

  // Handle delete contact - show confirmation dialog
  // Handle mark follow-up as done
  const handleMarkFollowUpDone = async (communicationId: number, studentName: string) => {
    try {
      await parentCommunicationsAPI.update(communicationId, { follow_up_needed: false });
      showToast(`Follow-up marked done for ${studentName}`, 'success');
      refreshData();
    } catch {
      showToast('Failed to mark follow-up as done', 'error');
    }
  };

  const handleDeleteContact = (id: number) => {
    setDeleteConfirmId(id);
  };

  // Confirm deletion
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      // Pass 'system' as deleted_by until OAuth is implemented
      await parentCommunicationsAPI.delete(deleteConfirmId, 'system');
      setSelectedContactId(null);
      setDeleteConfirmId(null);
      refreshData();
      showToast('Contact record deleted', 'success');
    } catch (error) {
      showToast('Failed to delete contact record', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel deletion
  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  // Handle modal close
  const handleModalClose = (saved?: boolean) => {
    setShowRecordModal(false);
    if (saved) {
      showToast(editingContact ? 'Contact record updated' : 'Contact record saved', 'success');
      refreshData();
    }
    setEditingContact(null);
    // Note: modalPreselectedStudentId is set fresh in handleRecordContact,
    // don't clear it here to avoid race conditions with quick close/reopen
  };

  // Handle calendar event click
  const handleCalendarEventClick = (contact: ParentCommunication) => {
    setSelectedContactId(contact.id);
    if (isMobile) {
      setMobileTab('details');
    }
  };

  // Handle student click - show their contact history
  const handleStudentClick = (student: StudentContactStatus) => {
    setSelectedStudentId(student.student_id);
    setSelectedContactId(null); // Clear contact selection to show history view
    if (isMobile) {
      setMobileTab('details');
    }
  };

  // Get student contact history for detail panel
  const selectedStudentInfo = useMemo(() => {
    return studentStatuses.find(s => s.student_id === selectedStudentId);
  }, [studentStatuses, selectedStudentId]);

  // Fetch student contact history via API (not filtered from calendar)
  // Keep fetching even when viewing a contact detail so we can find historical contacts
  const { data: studentContactHistory = [], isLoading: loadingHistory } = useSWR(
    selectedStudentId
      ? ['student-contact-history', selectedStudentId]
      : null,
    () => parentCommunicationsAPI.getAll({ student_id: selectedStudentId! })
      .then(contacts => contacts.sort((a, b) =>
        new Date(b.contact_date).getTime() - new Date(a.contact_date).getTime()
      )),
    { revalidateOnFocus: false }
  );

  // Selected contact details - search both calendar events and student history
  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return calendarEvents.find(c => c.id === selectedContactId)
      || studentContactHistory.find(c => c.id === selectedContactId)
      || null;
  }, [calendarEvents, studentContactHistory, selectedContactId]);

  const isLoading = loadingStatuses && studentStatuses.length === 0;

  // Toolbar classes
  const toolbarClasses = cn(
    "sticky top-0 z-30 flex flex-wrap items-center gap-2 sm:gap-3",
    "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
    "rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex-1 overflow-hidden flex flex-col">
        <div className="flex flex-col gap-3 p-2 sm:p-4 h-full overflow-hidden">
          {/* Toolbar */}
          <div className={toolbarClasses}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
              {/* Title + Tutor Selector */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                  <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                    Parent Contacts
                  </h1>
                </div>

                <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

                {/* Tutor Selector - show for admin-level users */}
                {canViewAdminPages && (
                  <TutorSelector
                    value={selectedTutorId}
                    onChange={setSelectedTutorId}
                    location={selectedLocation}
                    showAllTutors={true}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 sm:ml-auto">
                <button
                  onClick={() => handleRecordContact()}
                  disabled={isReadOnly}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isReadOnly
                      ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      : "bg-[#a0704b] dark:bg-[#8b6f47] text-white hover:bg-[#8b5d3b] dark:hover:bg-[#7a5f3a]"
                  )}
                  title={isReadOnly ? "Read-only access" : undefined}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Record Contact</span>
                  <span className="sm:hidden">Add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          {isMobile && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => setMobileTab('list')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors",
                  mobileTab === 'list'
                    ? "bg-white dark:bg-[#1a1a1a] text-[#a0704b] shadow-sm"
                    : "text-gray-600 dark:text-gray-400"
                )}
              >
                <LayoutList className="h-4 w-4" />
                Students
              </button>
              <button
                onClick={() => setMobileTab('calendar')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors",
                  mobileTab === 'calendar'
                    ? "bg-white dark:bg-[#1a1a1a] text-[#a0704b] shadow-sm"
                    : "text-gray-600 dark:text-gray-400"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </button>
              <button
                onClick={() => setMobileTab('details')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors",
                  mobileTab === 'details'
                    ? "bg-white dark:bg-[#1a1a1a] text-[#a0704b] shadow-sm"
                    : "text-gray-600 dark:text-gray-400",
                  !selectedContact && !selectedStudentId && "opacity-50"
                )}
                disabled={!selectedContact && !selectedStudentId}
              >
                Details
              </button>
            </div>
          )}

          {/* Stats Bar */}
          <ContactStatsBar stats={communicationStats} loading={loadingStats} />

          {/* Pending Follow-ups */}
          {pendingFollowups.length > 0 && (!isMobile || mobileTab === 'list') && (
            <PendingFollowupsSection
              followups={pendingFollowups}
              onRecordContact={(studentId) => handleRecordContact(studentId)}
              onMarkDone={handleMarkFollowUpDone}
              onStudentClick={handleStudentClick}
              selectedStudentId={selectedStudentId}
              showLocationPrefix={showLocationPrefix}
              readOnly={isReadOnly}
            />
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading student contacts...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {statusError && (
            <div className="flex justify-center py-12">
              <StickyNote variant="pink" size="lg" showTape>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {statusError instanceof Error ? statusError.message : "Failed to load contacts"}
                  </p>
                </div>
              </StickyNote>
            </div>
          )}

          {/* Main Content - 3 Panel Layout (Desktop) / Tabbed (Mobile) */}
          {!isLoading && !statusError && (
            <div className={cn(
              "flex-1 overflow-hidden",
              isMobile ? "flex flex-col" : "grid grid-cols-[280px_1fr_320px] gap-4"
            )}>
              {/* Left Panel: Student List */}
              {(!isMobile || mobileTab === 'list') && (
                <div className={cn(
                  "overflow-hidden flex flex-col",
                  isMobile ? "flex-1" : ""
                )}>
                  <StudentContactList
                    students={studentStatuses}
                    selectedStudentId={selectedStudentId}
                    onStudentClick={handleStudentClick}
                    onRecordContact={handleRecordContact}
                    showLocationPrefix={showLocationPrefix}
                    readOnly={isReadOnly}
                    searchQuery={studentSearchQuery}
                    onSearchChange={setStudentSearchQuery}
                  />
                </div>
              )}

              {/* Center Panel: Calendar */}
              {(!isMobile || mobileTab === 'calendar') && (
                <div className={cn(
                  "overflow-hidden flex flex-col",
                  isMobile ? "flex-1" : ""
                )}>
                  <ContactCalendar
                    events={filteredCalendarEvents}
                    pendingFollowups={pendingFollowups}
                    selectedDate={calendarDate}
                    onDateChange={setCalendarDate}
                    view={calendarView}
                    onViewChange={setCalendarView}
                    selectedContactId={selectedContactId}
                    onEventClick={handleCalendarEventClick}
                    loading={loadingCalendar}
                    showLocationPrefix={showLocationPrefix}
                    activeContactTypes={activeContactTypes}
                    onToggleContactType={toggleContactType}
                  />
                </div>
              )}

              {/* Right Panel: Details */}
              {(!isMobile || mobileTab === 'details') && (
                <div className={cn(
                  "overflow-hidden flex flex-col",
                  isMobile ? "flex-1" : ""
                )}>
                  <ContactDetailPanel
                    contact={selectedContact}
                    studentContacts={selectedStudentId && !selectedContactId ? studentContactHistory : undefined}
                    selectedStudent={selectedStudentId && !selectedContactId ? selectedStudentInfo : undefined}
                    isLoadingHistory={selectedStudentId && !selectedContactId ? loadingHistory : false}
                    onContactSelect={(c) => setSelectedContactId(c.id)}
                    onBack={selectedStudentId && selectedContactId ? () => setSelectedContactId(null) : undefined}
                    onEdit={handleEditContact}
                    onDelete={handleDeleteContact}
                    onRecordNew={(studentId) => handleRecordContact(studentId)}
                    showLocationPrefix={showLocationPrefix}
                    readOnly={isReadOnly}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <ScrollToTopButton />
      </PageTransition>

      {/* Record Contact Modal */}
      <RecordContactModal
        isOpen={showRecordModal}
        onClose={handleModalClose}
        editingContact={editingContact}
        preselectedStudentId={modalPreselectedStudentId}
        tutorId={typeof selectedTutorId === 'number' ? selectedTutorId : undefined}
        location={effectiveLocation}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        title="Delete Contact Record"
        message="Are you sure you want to delete this contact record? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />
    </DeskSurface>
  );
}
