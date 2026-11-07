"""Reviewed future enrollment edits preserve source history in synthetic SQLite."""
from datetime import date
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from billing.models import BillingAccount, BillingDraft, BillingDraftRevision, BillingLessonClaim, BillingPayment
from billing.schemas import BillingDraftReview, BillingDraftReviewRequest
from models import Enrollment, SessionLog
from tests.test_billing_workflow import env, draft_env, next_review, confirmed, confirmation, preference, second_class

@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Renewal changes may only use synthetic SQLite.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)

def renewal(client, first='2026-11-12', weekday='Thu', time='18:00 - 19:30'):
    payload = next_review(client, [11])
    payload['scenario']['first_lesson_date'] = first
    payload['scenario']['slots'][0].update(weekday=weekday, time_slot=time)
    payload['renewal'] = {'source_enrollment_ids': [11], 'reason': 'Parent agreed to the next enrollment timetable.'}
    return payload

def review(client, payload):
    response = client.post('/api/billing/students/101/draft-review', json=payload)
    assert response.status_code == 200, response.text
    return response.json()

def source_snapshot(session):
    return [tuple(row) for row in session.query(SessionLog.id, SessionLog.enrollment_id, SessionLog.session_date,
        SessionLog.time_slot, SessionLog.location, SessionLog.session_status, SessionLog.financial_status,
        SessionLog.tutor_id).filter(SessionLog.enrollment_id == 11).order_by(SessionLog.id)]

def test_changes_create_new_enrollment_with_original_teacher_and_source_link_only(env):
    client, session, _ = env
    before = source_snapshot(session)
    payload = renewal(client)
    value = review(client, payload)
    assert not value['message']['blocked_reasons']
    assert value['renewal'] == payload['renewal']
    assert any(i['code'] == 'RENEWAL_DETAILS_CHANGED' for i in value['issues'])
    draft, data, payment = confirmed(client, payload=payload)
    assert payment['review']['renewal'] == payload['renewal']
    line = payment['lines'][0]
    new = session.get(Enrollment, line['enrollment_id'])
    assert (new.assigned_day, new.assigned_time, new.location) == ('Thu', '18:00 - 19:30', 'MSA')
    assert new.first_lesson_date == date(2026, 11, 12)
    assert (new.tutor_id, new.renewed_from_enrollment_id) == (1, 11)
    assert source_snapshot(session) == before and session.get(Enrollment, 11).payment_status == 'Paid'
    assert all(r.session_date > date(2026, 11, 6) for r in session.query(SessionLog).filter_by(enrollment_id=new.id))
    replay = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert replay.status_code == 200 and replay.json()['id'] == payment['id']
    assert session.query(BillingPayment).count() == 1 and session.query(Enrollment).count() == 2
    assert session.query(BillingLessonClaim).count() == line['lesson_count']

def test_target_reordering_preserves_both_source_teachers_and_lineage(env):
    client, session, _ = env
    second_class(session)
    p = next_review(client, [11, 12]); old = {s['weekday']: s for s in p['scenario']['slots']}
    p['scenario']['first_lesson_date'] = '2026-11-08'
    p['scenario']['slots'] = [{**old['Sat'], 'weekday': 'Sun', 'time_slot': '12:00 - 13:30'}, {**old['Fri'], 'weekday': 'Thu', 'time_slot': '18:00 - 19:30'}]
    p['renewal'] = {'source_enrollment_ids': [12, 11], 'reason': 'Both future enrollments move to their agreed classes.'}
    assert not review(client, p)['message']['blocked_reasons']
    _, _, payment = confirmed(client, payload=p)
    rows = [session.get(Enrollment, l['enrollment_id']) for l in payment['lines']]
    assert [(r.assigned_day, r.tutor_id, r.renewed_from_enrollment_id) for r in rows] == [('Sun', 2, 12), ('Thu', 1, 11)]
    assert session.get(Enrollment, 11).assigned_day == 'Fri' and session.get(Enrollment, 12).assigned_day == 'Sat'

def test_ordinary_review_preserves_old_serialization_and_null_hash_shape(env):
    client, _, _ = env
    p = next_review(client, [11]); value = review(client, p)
    assert 'renewal' not in value
    assert 'renewal' not in BillingDraftReviewRequest.model_validate(p).model_dump(mode='json')
    assert 'renewal' not in BillingDraftReview.model_validate(value).model_dump(mode='json')
    assert review(client, {**p, 'renewal': None})['review_hash'] == value['review_hash']

def test_unmarked_edits_keep_existing_strict_source_gates(env):
    client, _, _ = env
    p = renewal(client);p.pop('renewal')
    assert {'SCENARIO_SOURCE_MISMATCH', 'SOURCE_DATE_MISMATCH'} <= {i['code'] for i in review(client, p)['issues']}

@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_non_admin_cannot_review_changes(env, role):
    client, session, user = env
    p=renewal(client);p['confirmed_checks']=[];user.role=role
    assert client.post('/api/billing/students/101/draft-review',json=p).status_code==403
    assert session.query(Enrollment).count()==1 and session.query(BillingPayment).count()==0

@pytest.mark.parametrize('change', [
    {'source_enrollment_ids':[11],'reason':'  '}, {'source_enrollment_ids':[11,11],'reason':'Duplicate source'},
    {'source_enrollment_ids':[999],'reason':'Wrong source'}, {'source_enrollment_ids':[],'reason':'Missing source'},
    {'source_enrollment_ids':[11],'reason':'x'*501},
])
def test_invalid_mapping_or_reason_is_rejected_without_writes(env,change):
    client,session,_=env;p=renewal(client);p['renewal']=change
    assert client.post('/api/billing/students/101/draft-review',json=p).status_code==422
    assert session.query(BillingDraftRevision).count()==0

def test_changes_require_counting_unpaid_coverage(env):
    client,_,_=env;p=renewal(client)
    c=client.get('/api/billing/students/101/context',params={'basis':'paid_only','selected_enrollment_ids':11}).json()
    p.update(basis='paid_only',expected_source_fingerprint=c['source_fingerprint'])
    v=review(client,p);assert any(i['code']=='RENEWAL_SOURCE_REVIEW' for i in v['issues']) and v['message']['blocked_reasons']

def test_coverage_markers_and_scheme_remain_authoritative(env):
    client,_,_=env;p=renewal(client);p['scenario']['slots'][0]['covered_through']='2026-10-01';p['scenario']['mode']='regular'
    v=review(client,p)
    assert {'SOURCE_COVERAGE_MISMATCH','SCENARIO_POLICY_MISMATCH'} <= {i['code'] for i in v['issues']}
    assert v['message']['blocked_reasons']

def test_changed_time_does_not_allow_start_before_retained_coverage(env):
    client,session,_=env;p=renewal(client,first='2026-11-05')
    assert any(i['code']=='RENEWAL_START_BEFORE_COVERAGE' for i in review(client,p)['issues'])
    preference(client)
    c=client.get('/api/billing/students/101/context',params={'basis':'include_pending','selected_enrollment_ids':11}).json();p['expected_source_fingerprint']=c['source_fingerprint']
    draft,data=confirmation(client,payload=p)
    assert client.post(f"/api/billing/drafts/{draft['id']}/confirm",json=data).status_code==422
    assert session.query(Enrollment).count()==1 and session.query(BillingPayment).count()==0

def test_postponed_start_requires_exact_omitted_date_confirmation(env):
    client,_,_=env;p=renewal(client,first='2026-11-26');before=review(client,p)
    issue=next(i for i in before['issues'] if i['code']=='RENEWAL_START_GAP')
    assert '2026-11-12' in issue['message'] and '2026-11-19' in issue['message'] and before['message']['blocked_reasons']
    p['confirmed_checks'].append('RENEWAL_START_GAP');after=review(client,p)
    assert not after['message']['blocked_reasons'] and before['review_hash']!=after['review_hash']

@pytest.mark.parametrize('field,value',[('time_slot','nonsense'),('location','Various'),('location','UNKNOWN')])
def test_target_schedule_needs_supported_branch_and_valid_time(env,field,value):
    client,_,_=env;p=renewal(client);p['scenario']['slots'][0][field]=value
    assert client.post('/api/billing/students/101/draft-review',json=p).status_code==422

def test_changed_source_cannot_confirm_previously_reviewed_override(env):
    client,session,_=env;preference(client);p=renewal(client);draft,data=confirmation(client,payload=p)
    session.get(SessionLog,115).financial_status='Unpaid';session.commit()
    assert client.post(f"/api/billing/drafts/{draft['id']}/confirm",json=data).status_code==409
    assert session.query(BillingPayment).count()==0 and session.query(Enrollment).count()==1

def test_reason_changes_the_exact_review_hash(env):
    client,_,_=env;p=renewal(client);first=review(client,p);p['renewal']['reason']='A different reviewed reason.'
    assert first['review_hash']!=review(client,p)['review_hash']

@pytest.mark.parametrize('first,method,end,debit',[
    ('2026-12-31','manual','2027-02-28',None), ('2026-12-31','autopay','2027-01-31','2026-11-20'),
    ('2027-01-07','manual','2027-02-28',None), ('2027-01-07','autopay','2027-01-31','2026-12-20'),
])
def test_date_changes_keep_transition_and_regular_collection_boundaries(env,first,method,end,debit):
    client,_,_=env;p=renewal(client,first=first);p['scenario'].update(payment_method=method,mandate_ready=True);p['confirmed_checks'].append('RENEWAL_START_GAP')
    v=review(client,p);assert not v['message']['blocked_reasons']
    assert v['period']['coverage_through']==end and v['period']['collection']['debit_from']==debit

def test_holiday_and_year_end_limits_still_apply(env):
    client,_,_=env
    for first,weekday in [('2026-12-25','Fri'),('2027-07-08','Thu')]:
        assert client.post('/api/billing/students/101/draft-review',json=renewal(client,first=first,weekday=weekday)).status_code==422

def test_unrelated_student_lesson_overlap_blocks_preview_and_confirmation(env):
    client,session,_=env
    session.add(Enrollment(id=22,student_id=101,tutor_id=1,assigned_day='Thu',assigned_time='18:30 - 20:00',location='MSB',lessons_paid=1,first_lesson_date=date(2026,11,12),payment_status='Paid',enrollment_type='One-Time',is_new_student=False))
    session.flush()
    session.add(SessionLog(id=220,enrollment_id=22,student_id=101,tutor_id=1,session_date=date(2026,11,12),time_slot='18:30 - 20:00',location='MSB',session_status='Scheduled',financial_status='Paid'))
    session.commit();preference(client);p=renewal(client)
    value=review(client,p)
    assert any(i['code']=='RENEWAL_SESSION_CONFLICT' for i in value['issues'])
    assert value['message']['blocked_reasons'] and value['message']['en'] is None
    draft,data=confirmation(client,payload=p)
    r=client.post(f"/api/billing/drafts/{draft['id']}/confirm",json=data)
    assert r.status_code==422 and 'already has a lesson' in r.text
    assert session.query(BillingPayment).count()==0 and session.query(Enrollment).count()==2

def test_pending_same_class_coverage_cannot_be_bypassed_by_changing_weekday(env):
    from datetime import timedelta
    client,session,_=env
    session.add(Enrollment(id=12,student_id=101,tutor_id=1,assigned_day='Fri',assigned_time='16:00 - 17:30',location='MSA',lessons_paid=6,first_lesson_date=date(2026,11,13),payment_status='Pending Payment',enrollment_type='Regular',renewed_from_enrollment_id=11,is_new_student=False))
    session.flush()
    for i in range(6):session.add(SessionLog(id=120+i,enrollment_id=12,student_id=101,tutor_id=1,session_date=date(2026,11,13)+timedelta(weeks=i),time_slot='16:00 - 17:30',location='MSA',session_status='Scheduled',financial_status='Unpaid'))
    session.commit();p=renewal(client)
    assert p['scenario']['slots'][0]['covered_through']=='2026-12-18'
    v=review(client,p)
    assert any(i['code']=='RENEWAL_START_BEFORE_COVERAGE' for i in v['issues']) and v['message']['blocked_reasons']
    assert session.get(Enrollment,12).payment_status=='Pending Payment' and session.query(SessionLog).filter_by(enrollment_id=12).count()==6

def test_branch_change_keeps_old_branch_and_future_source_lineage(env):
    client,session,_=env;p=renewal(client);p['scenario']['slots'][0]['location']='MSB'
    _,_,payment=confirmed(client,payload=p)
    new=session.get(Enrollment,payment['lines'][0]['enrollment_id'])
    assert new.location=='MSB' and new.renewed_from_enrollment_id==11 and new.tutor_id==1
    assert session.get(Enrollment,11).location=='MSA'
    assert all(r.location=='MSA' for r in session.query(SessionLog).filter_by(enrollment_id=11))

@pytest.mark.parametrize('first,weekday,method,blocked',[
    ('2026-11-19','Thu','manual',False), ('2026-11-20','Fri','autopay',True), ('2026-11-26','Thu','autopay',False),
])
def test_collection_cutoff_checks_are_not_waived_by_a_renewal_reason(env,first,weekday,method,blocked):
    client,_,_=env;p=renewal(client,first=first,weekday=weekday);p['scenario'].update(payment_method='autopay',mandate_ready=True);p['confirmed_checks'].append('RENEWAL_START_GAP')
    v=review(client,p)
    assert v['period']['collection']['method']==method
    assert bool(v['message']['blocked_reasons'])==blocked
    if blocked:assert any(i['code']=='COLLECTION_BEFORE_LESSON' for i in v['issues'])

def test_foreign_source_ids_cannot_become_renewal_lineage(env):
    client,session,_=env
    session.add(Enrollment(id=99,student_id=102,tutor_id=1,assigned_day='Fri',assigned_time='16:00 - 17:30',location='MSA',lessons_paid=6,first_lesson_date=date(2026,10,2),payment_status='Paid',enrollment_type='Regular',is_new_student=False));session.commit()
    p=renewal(client);p['selected_enrollment_ids']=[99];p['renewal']['source_enrollment_ids']=[99]
    response=client.post('/api/billing/students/101/draft-review',json=p)
    assert response.status_code==422 and 'Another student' not in response.text
    assert session.query(BillingPayment).count()==0 and session.query(Enrollment).count()==2

def test_changed_source_fingerprint_still_blocks_review_before_save(env):
    client,session,_=env;p=renewal(client)
    session.get(SessionLog,115).time_slot='17:00 - 18:30';session.commit()
    r=client.post('/api/billing/students/101/draft-review',json=p)
    assert r.status_code==409 and 'records have changed' in r.json()['detail']
    assert session.query(BillingDraftRevision).count()==0

def test_override_is_only_for_the_next_period_and_does_not_add_a_coverage_waiver(env):
    client,_,_=env;p=renewal(client);p['period_number']=2
    assert client.post('/api/billing/students/101/draft-review',json=p).status_code==422
    p['period_number']=1;p['confirmed_checks'].append('SOURCE_COVERAGE_MISMATCH')
    assert client.post('/api/billing/students/101/draft-review',json=p).status_code==422


def test_changed_classes_cannot_overlap_each_other(env):
    client,session,_=env
    second_class(session)
    p=next_review(client,[11,12])
    p['scenario']['first_lesson_date']='2026-11-12'
    for slot,time in zip(p['scenario']['slots'],['18:00 - 19:30','18:30 - 20:00']):
        slot.update(weekday='Thu',time_slot=time)
    p['renewal']={'source_enrollment_ids':[11,12],'reason':'Proposed new timetable.'}
    value=review(client,p)
    assert any(i['code']=='RENEWAL_SESSION_CONFLICT' for i in value['issues'])
    assert value['message']['blocked_reasons'] and value['message']['en'] is None


def test_cancelled_session_with_financial_claim_still_blocks_override_review(env):
    client,session,_=env
    preference(client)
    account=session.query(BillingAccount).one()
    session.add(BillingDraft(id='claimed-draft',account_id=account.id,current_revision=1))
    session.flush()
    session.add(BillingPayment(id='claimed-payment',account_id=account.id,draft_id='claimed-draft',draft_revision=1,snapshot={}))
    session.add(Enrollment(id=22,student_id=101,tutor_id=1,assigned_day='Thu',assigned_time='18:00 - 19:30',location='MSA',lessons_paid=1,first_lesson_date=date(2026,11,12),payment_status='Paid',enrollment_type='One-Time',is_new_student=False))
    session.flush()
    session.add(SessionLog(id=220,enrollment_id=22,student_id=101,tutor_id=1,session_date=date(2026,11,12),time_slot='18:00 - 19:30',location='MSA',session_status='Cancelled',financial_status='Paid'))
    session.flush()
    session.add(BillingLessonClaim(student_id=101,payment_id='claimed-payment',enrollment_id=22,session_id=220,lesson_date=date(2026,11,12),time_slot='18:00-19:30',location='MSA'))
    session.commit()
    value=review(client,renewal(client))
    assert any(i['code']=='RENEWAL_SESSION_CONFLICT' and 'confirmed payment' in i['message'] for i in value['issues'])
    assert value['message']['blocked_reasons'] and value['message']['en'] is None


def test_draft_only_preview_does_not_require_workflow_claim_table(env,monkeypatch):
    client,session,_=env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED','false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED','false')
    BillingLessonClaim.__table__.drop(session.get_bind())
    value=review(client,renewal(client))
    assert not value['message']['blocked_reasons'] and value['message']['en']


def target_tutor(session, *, last_day=None):
    from models import Tutor
    tutor = Tutor(id=3, user_email='renewal-target@example.test', tutor_name='Renewal Tutor', role='Tutor',
                  departure_effective_on=last_day)
    session.add(tutor)
    session.commit()
    return tutor


def tutor_renewal(client, tutor_ids=None):
    payload = next_review(client, [11])
    payload['renewal'] = {'source_enrollment_ids': [11], 'tutor_ids': tutor_ids or [3],
                          'reason': 'Parent confirmed the new tutor for the next enrollment.'}
    return payload


def test_tutor_only_change_applies_to_new_enrollment_sessions_and_line_evidence(env):
    client, session, _ = env
    target_tutor(session)
    before = source_snapshot(session)
    payload = tutor_renewal(client)
    value = review(client, payload)
    assert not value['message']['blocked_reasons']
    assert any(issue['code'] == 'RENEWAL_DETAILS_CHANGED' and 'Renewal Tutor' in issue['message'] for issue in value['issues'])
    draft, confirm, payment = confirmed(client, payload=payload)
    new_id = payment['lines'][0]['enrollment_id']
    new = session.get(Enrollment, new_id)
    assert (new.tutor_id, new.renewed_from_enrollment_id) == (3, 11)
    assert new.assigned_day == 'Fri' and new.assigned_time == '16:00 - 17:30'
    assert all(row.tutor_id == 3 for row in session.query(SessionLog).filter_by(enrollment_id=new_id))
    assert session.get(Enrollment, 11).tutor_id == 1 and source_snapshot(session) == before
    assert payment['lines'][0]['tutor_name'] == 'Renewal Tutor'
    assert session.get(BillingPayment, payment['id']).snapshot['line_evidence'][str(new_id)]['tutor_id'] == 3
    again = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirm)
    assert again.status_code == 200 and again.json()['id'] == payment['id']
    assert session.query(BillingPayment).count() == 1


def test_tutor_mapping_follows_class_order_independently_of_source_id_order(env):
    client, session, _ = env
    second_class(session)
    payload = next_review(client, [11, 12])
    by_day = {slot['weekday']: slot for slot in payload['scenario']['slots']}
    payload['scenario']['slots'] = [by_day['Sat'], by_day['Fri']]
    payload['renewal'] = {'source_enrollment_ids': [12, 11], 'tutor_ids': [1, 2],
                          'reason': 'The tutors exchange their next classes.'}
    _, _, payment = confirmed(client, payload=payload)
    rows = [session.get(Enrollment, line['enrollment_id']) for line in payment['lines']]
    assert [(row.assigned_day, row.tutor_id, row.renewed_from_enrollment_id) for row in rows] == [
        ('Sat', 1, 12), ('Fri', 2, 11),
    ]
    assert session.get(Enrollment, 11).tutor_id == 1 and session.get(Enrollment, 12).tutor_id == 2


def test_absent_or_null_tutor_ids_keep_existing_override_hashes_and_inherited_teacher(env):
    client, _, _ = env
    payload = renewal(client)
    original = review(client, payload)
    assert 'tutor_ids' not in original['renewal']
    assert 'tutor_ids' not in BillingDraftReviewRequest.model_validate(payload).model_dump(mode='json')['renewal']
    payload['renewal']['tutor_ids'] = None
    assert review(client, payload)['review_hash'] == original['review_hash']
    assert 'tutor_ids' not in BillingDraftReview.model_validate(original).model_dump(mode='json')['renewal']


@pytest.mark.parametrize('ids', [[], [0], [-1], [1, 2]])
def test_incomplete_or_invalid_tutor_mapping_is_rejected_without_writes(env, ids):
    client, session, _ = env
    payload = tutor_renewal(client)
    payload['renewal']['tutor_ids'] = ids
    assert client.post('/api/billing/students/101/draft-review', json=payload).status_code == 422
    assert session.query(BillingDraftRevision).count() == 0 and session.query(Enrollment).count() == 1


def test_missing_tutor_blocks_fee_message_and_enrollment_confirmation(env):
    client, session, _ = env
    preference(client)
    payload = tutor_renewal(client, [999])
    value = review(client, payload)
    assert any(issue['code'] == 'RENEWAL_TUTOR_UNAVAILABLE' for issue in value['issues'])
    assert value['message']['blocked_reasons'] and value['message']['zh'] is None
    draft, data = confirmation(client, payload=payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 409 and 'tutor is no longer available' in response.text
    assert session.query(BillingPayment).count() == 0 and session.query(Enrollment).count() == 1


@pytest.mark.parametrize('change', ['deleted', 'renamed', 'departure'])
def test_changed_target_tutor_invalidates_saved_draft_before_confirmation(env, change):
    client, session, _ = env
    tutor = target_tutor(session)
    preference(client)
    payload = tutor_renewal(client)
    draft, data = confirmation(client, payload=payload)
    if change == 'deleted':
        session.delete(tutor)
    elif change == 'renamed':
        tutor.tutor_name = 'Corrected Tutor Name'
    else:
        tutor.departure_effective_on = date(2026, 11, 13)
    session.commit()
    detail = client.get(f"/api/billing/drafts/{draft['id']}")
    assert detail.status_code == 200 and not detail.json()['can_copy']
    assert detail.json()['stale_reasons']
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 409
    assert session.query(BillingPayment).count() == 0 and session.query(Enrollment).count() == 1


@pytest.mark.parametrize('last_day,allowed', [(date(2026, 11, 13), False), (date(2026, 12, 18), True)])
def test_tutor_departure_uses_last_lesson_of_finite_renewal(env, last_day, allowed):
    client, session, _ = env
    target_tutor(session, last_day=last_day)
    value = review(client, tutor_renewal(client))
    assert value['period']['last_lesson_date'] == '2026-12-18'
    assert bool(value['message']['blocked_reasons']) is not allowed
    if not allowed:
        assert any(issue['code'] == 'RENEWAL_TUTOR_UNAVAILABLE' and 'cannot be assigned' in issue['message'] for issue in value['issues'])
    else:
        _, _, payment = confirmed(client, payload=tutor_renewal(client))
        assert payment['lines'][0]['tutor_id'] == 3
