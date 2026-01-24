# Make-up Proposal & Confirmation System

## Overview

When scheduling make-up classes, tutors who are not the student's main teacher may need to consult other tutors about suitable time slots. This system allows tutors to propose slots that require confirmation before booking.

## Problem Statement

**Scenario:** Tutor A (covering for absent Tutor B) needs to schedule a make-up class for Student X. Tutor A is unsure which slot works best and Tutor B is currently unavailable. Without this system, Tutor A would need to wait or make guesses, potentially booking unsuitable slots.

**Solution:** Tutor A can propose 1-3 time slot options. Each slot's designated tutor receives a notification and can approve or reject. The first approved slot wins, and the make-up is automatically booked.

---

## Requirements

### Core Functionality
- Tutors can propose 1-3 specific slot options for a pending make-up
- Each slot option can have a different target tutor
- All targeted tutors + proposer see the full proposal with all slots
- Each tutor can only approve/reject slots assigned to them
- First approved slot wins; other slots auto-reject
- If all slots are rejected, the proposal fails and session returns to "Pending Make-up"
- Alternative: "Needs Input" mode asks the main tutor to select a slot directly

### Visibility
- Proposals appear in session views (list, weekly) with distinct styling
- Proposals count toward slot availability in ScheduleMakeupModal calendar
- NotificationBell shows pending proposal count for target tutors
- Inbox has dedicated "MakeupConfirmation" category

### Constraints
- One active proposal per pending session
- No auto-expiry (manual resolution required)
- Admins can manage any proposal

---

## Database Schema

### Table: `makeup_proposals`

```sql
CREATE TABLE makeup_proposals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_session_id INT NOT NULL,      -- Session with "Pending Make-up" status
    proposed_by_tutor_id INT NOT NULL,     -- Tutor A

    -- Proposal type: 'specific_slots' (1-3 options) or 'needs_input' (ask main tutor)
    proposal_type ENUM('specific_slots', 'needs_input') NOT NULL,

    -- For needs_input: single target tutor (main tutor from enrollment)
    needs_input_tutor_id INT NULL,

    -- Metadata
    notes TEXT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,

    -- Link to auto-created message for discussion
    message_id INT NULL,

    FOREIGN KEY (original_session_id) REFERENCES session_log(id),
    FOREIGN KEY (proposed_by_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (needs_input_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id),

    INDEX idx_original_session (original_session_id),
    INDEX idx_status (status)
);
```

### Table: `makeup_proposal_slots`

```sql
CREATE TABLE makeup_proposal_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proposal_id INT NOT NULL,
    slot_order INT NOT NULL DEFAULT 1,     -- 1, 2, or 3 for ordering

    -- Slot details
    proposed_date DATE NOT NULL,
    proposed_time_slot VARCHAR(100) NOT NULL,
    proposed_tutor_id INT NOT NULL,        -- Target tutor for this slot
    proposed_location VARCHAR(100) NOT NULL,

    -- Slot-level status
    slot_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    resolved_at TIMESTAMP NULL,
    resolved_by_tutor_id INT NULL,
    rejection_reason TEXT NULL,

    FOREIGN KEY (proposal_id) REFERENCES makeup_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (proposed_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (resolved_by_tutor_id) REFERENCES tutors(id),

    INDEX idx_proposal_id (proposal_id),
    INDEX idx_tutor_pending (proposed_tutor_id, slot_status),
    INDEX idx_date_time (proposed_date, proposed_time_slot)
);
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/makeup-proposals` | Create proposal (with 1-3 slots or needs_input) |
| GET | `/makeup-proposals` | List proposals (filter by tutor, status) |
| GET | `/makeup-proposals/{id}` | Get proposal with all slots |
| POST | `/makeup-proposals/slots/{slot_id}/approve` | Approve a slot (books make-up, auto-rejects siblings) |
| POST | `/makeup-proposals/slots/{slot_id}/reject` | Reject a slot (if all rejected, proposal rejected) |
| POST | `/makeup-proposals/{id}/reject` | Reject entire proposal (needs_input type) |
| DELETE | `/makeup-proposals/{id}` | Cancel proposal (by proposer) |
| GET | `/makeup-proposals/pending-count` | Count pending for current tutor (notification bell) |

---

## Workflow

### Creating a Proposal

```
1. Tutor A opens ScheduleMakeupModal for a "Pending Make-up" session

2a. PROPOSE SPECIFIC SLOTS (1-3 options):
    - Select first slot, click "Add to proposal"
    - Optionally add 2nd and 3rd slot options
    - Each slot shows its target tutor (auto-determined)
    - Enter optional notes
    - Click "Send Proposal"
    → Creates makeup_proposal + makeup_proposal_slots
    → Auto-creates message thread (visible to proposer + all target tutors)
    → Original session stays "Pending Make-up"

2b. FLAG FOR INPUT (no slots selected):
    - Click "Ask Main Tutor"
    - Enter optional notes
    → Creates makeup_proposal (type: needs_input)
    → Auto-creates message to main tutor
    → Original session stays "Pending Make-up"
```

### Receiving Notifications

```
3. Each target tutor sees notification in NotificationBell
   - Shows count of pending slots they can approve
   - Click → goes to Inbox → MakeupConfirmation category
```

### Resolving a Proposal

```
4a. APPROVE A SLOT:
    - Tutor sees proposal with all slots (but can only act on their own)
    - Click "Approve" on their slot
    → Slot status → 'approved'
    → Other sibling slots → auto-rejected
    → Proposal status → 'approved'
    → Make-up session booked automatically
    → Original session → "Make-up Booked"
    → All involved tutors notified

4b. REJECT A SLOT:
    - Click "Reject" on their slot
    - Optionally enter reason
    → Slot status → 'rejected'
    → If ALL slots now rejected:
      → Proposal status → 'rejected'
      → Original session stays "Pending Make-up"
      → Proposer notified to try again

4c. NEEDS_INPUT FLOW:
    - Main tutor clicks "Select Slot"
    - Opens ScheduleMakeupModal to pick slot
    - Books directly (they are the authority)
    → Proposal status → 'approved'
```

### Discussion

```
5. All involved tutors can reply to the message thread
   - Standard inbox threading
   - Helps coordinate when slots need discussion
```

---

## UI Components

### ScheduleMakeupModal Additions
- **Propose Mode Toggle**: Switch between "Book" and "Propose" modes
- **Slot Queue**: Shows selected slots (up to 3) with target tutors
- **"Add to proposal" button**: Adds current slot to queue
- **Notes field**: Optional message to target tutors
- **Calendar overlay**: Shows existing proposals as tentative (different color/style)
- **Day picker**: Shows proposals in slot list with distinct styling

### NotificationBell
- New item: "Pending Confirmations" with count
- Count = slots where user is `proposed_tutor_id` and `slot_status = 'pending'`

### Inbox - MakeupConfirmation Category
- Dedicated category in sidebar
- ProposalCard component showing:
  - Student name and original session details
  - All proposed slots with their status
  - Approve/Reject buttons for user's slots only
  - Notes from proposer
  - Discussion thread

### Session List & Weekly Views
- Proposals appear as distinct rows (dashed border, "Proposed" badge)
- Visual: lighter color, proposal icon
- Shows: Student name, proposed date/time, proposer
- Click opens proposal details (approve/reject if user is target tutor)

---

## Files to Modify

### Backend
- `database/migrations/0XX_makeup_proposals.sql` - Create both tables
- `webapp/backend/models.py` - MakeupProposal + MakeupProposalSlot models
- `webapp/backend/schemas.py` - Proposal/Slot schemas, add MakeupConfirmation category
- `webapp/backend/routers/makeup_proposals.py` - New router
- `webapp/backend/main.py` - Register router

### Frontend
- `webapp/frontend/types/index.ts` - MakeupProposal, MakeupProposalSlot types
- `webapp/frontend/lib/api.ts` - proposalsAPI
- `webapp/frontend/lib/hooks.ts` - useProposals, usePendingProposalCount
- `webapp/frontend/components/sessions/ScheduleMakeupModal.tsx` - Propose mode
- `webapp/frontend/components/dashboard/NotificationBell.tsx` - Proposal count
- `webapp/frontend/app/inbox/page.tsx` - MakeupConfirmation category
- `webapp/frontend/components/inbox/ProposalCard.tsx` - New component
- `webapp/frontend/components/sessions/SessionList.tsx` - Show proposals
- `webapp/frontend/components/sessions/WeeklyView.tsx` - Show proposals
- `webapp/frontend/components/sessions/ProposalRow.tsx` - New component

---

## Implementation Phases

### Phase 1: Database & Backend
- Create migration for both tables
- Create models and schemas
- Implement API endpoints
- Add `include_proposals` param to sessions list endpoint

### Phase 2: Frontend - Proposal Creation
- Add propose mode to ScheduleMakeupModal
- Multi-slot selection UI
- Show proposals in calendar/day picker
- API integration

### Phase 3: Frontend - Proposal Review
- Add to NotificationBell
- Add MakeupConfirmation category to Inbox
- ProposalCard with per-slot approve/reject

### Phase 4: Frontend - Session Views
- Show proposals in SessionList
- Show proposals in WeeklyView
- ProposalRow component

### Phase 5: Testing & Polish
- End-to-end testing
- Error handling
- Edge cases (concurrent edits, permissions)

---

## Verification Checklist

### Backend
- [ ] Create proposal via API → verify database entries
- [ ] List proposals filtered by tutor, status
- [ ] Approve a slot → verify session created, siblings rejected
- [ ] Reject all slots → verify proposal rejected, original unchanged

### Frontend
- [ ] Open ScheduleMakeupModal → "Propose" mode available
- [ ] Select up to 3 slots → shows in proposal queue
- [ ] Create proposal → appears in calendar/day picker
- [ ] NotificationBell shows count for target tutor
- [ ] Inbox shows MakeupConfirmation category
- [ ] ProposalCard shows all slots, approve/reject works
- [ ] SessionList/WeeklyView shows proposals with distinct styling
