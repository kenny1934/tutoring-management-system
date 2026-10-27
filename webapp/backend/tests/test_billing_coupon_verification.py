"""Independent finite-coupon and receipt-order acceptance using synthetic SQLite."""
from datetime import date, datetime, timezone
from io import BytesIO
from uuid import uuid4

import pytest
from openpyxl import Workbook
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import coupon_accounting as accounting
from billing.coupon_models import CouponAccount, CouponImport, CouponObservation, CouponUse, CouponVerification
from billing.coupon_schemas import CouponVerificationConfirm, CouponVerificationRequest
from billing.drafts import DraftConflict
from billing.models import BillingPayment
from models import Enrollment, Student, StudentCoupon
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import (
    env as workflow_env, confirmed, confirmation, coupon_payload, pay_payload, preference, second_class,
)

DAY = date(2026, 10, 17)
EXPIRY = '2027-06-30'


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Coupon verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def coupon_env(workflow_env, monkeypatch):
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'true')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'true')
    return workflow_env


def group(value=300, quantity=1, expires_on=EXPIRY):
    return {'kind': 'staff' if value == 500 else 'ordinary', 'value':value,
            'quantity':quantity, 'expires_on':expires_on}


def observation(db, *, count=1, observed_on=DAY, student_id=101, marker='a'):
    imported = CouponImport(id=str(uuid4()), branch='MSA', observed_on=observed_on,
        source_sha256=marker*64, source_filename='synthetic-kms.xlsx', parsed_rows=[],
        created_by_name='Synthetic administrator')
    db.add(imported)
    db.flush()
    value = CouponObservation(id=str(uuid4()), student_id=student_id, import_id=imported.id,
        remaining_count=count, observed_on=observed_on,
        source_filename=imported.source_filename, source_sha256=imported.source_sha256)
    db.add(value)
    db.flush()
    account = db.get(CouponAccount, student_id)
    if account is None:
        account = CouponAccount(student_id=student_id, version=0)
        db.add(account)
    account.observation_id, account.verification_id = value.id, None
    account.version += 1
    db.commit()
    return value


def verify(db, actor, groups, *, student_id=101, reconciliations=(), as_of=DAY, key=None):
    balance = accounting.balance_for_student(db, student_id, as_of=as_of)
    request = CouponVerificationRequest(expected_version=balance.version,
        observation_id=balance.observation.id,
        checked_at=datetime.combine(as_of, datetime.min.time(), tzinfo=timezone.utc),
        groups=groups, reconciliations=list(reconciliations), reason='Synthetic KMS profile check.')
    reviewed = accounting.review_verification(db, student_id, request, as_of=as_of)
    assert reviewed.can_confirm, reviewed.model_dump(mode='json')
    payload = CouponVerificationConfirm(**request.model_dump(), expected_review_hash=reviewed.review_hash,
        idempotency_key=key or 'independent-verify-'+str(uuid4()))
    result = accounting.verify_coupons(db, student_id, payload, actor, as_of=as_of)
    db.commit()
    return result, payload


def balance(db, *, as_of=DAY):
    return accounting.balance_for_student(db, 101, as_of=as_of)


def first_payment(client, *, value=300, count=1, ids=(11,), expires_on=EXPIRY):
    payload = coupon_payload(client, ids=ids, value=value, count=count)
    payload['scenario']['coupon']['expires_on'] = expires_on
    _draft, _request, value = confirmed(client, payload=payload)
    return value


def pay(client, value, *, receipt=None, selected=None, used_on=None):
    changed = {'receipt_reference':receipt}
    if selected is not None:
        changed['coupon_selected'] = selected
    if used_on is not None:
        changed['coupon_used_on'] = used_on
    result = client.post(f"/api/billing/payments/{value['id']}/paid", json=pay_payload(value, **changed))
    assert result.status_code == 200, result.text
    return result.json()


def receipt(client, value, *, selected=True, used_on='2026-10-17', reference='SYNTHETIC-KMS-001', key='independent-receipt'):
    payload = {'expected_version':value['version'], 'idempotency_key':key,
        'receipt_reference':reference, 'coupon_selected':selected}
    if used_on is not None:
        payload['coupon_used_on'] = used_on
    return client.post(f"/api/billing/payments/{value['id']}/receipt", json=payload), payload


def workbook(rows):
    value = Workbook()
    sheet = value.active
    sheet.append(['ID#'] + [f'Unused{i}' for i in range(1,10)] + ['Coupon'])
    for company, count in rows:
        sheet.append([company] + ['']*9 + [count])
    output = BytesIO()
    value.save(output)
    value.close()
    return output.getvalue()


def test_confirmation_and_receipt_keep_consumed_coupon_unavailable_against_old_observation(coupon_env):
    client, db, actor = coupon_env
    db.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    db.commit()
    observation(db)
    verify(db, actor, [group()])
    value = first_payment(client)
    held = balance(db)
    assert held.usable_count == 0 and held.reserved_count == 1
    paid = pay(client, value)
    assert balance(db).receipt_pending_count == 1 and balance(db).usable_count == 0
    recorded, payload = receipt(client, paid)
    assert recorded.status_code == 200, recorded.text
    result = balance(db)
    assert result.usable_count == 0 and result.used_awaiting_sync_count == 1
    assert db.query(StudentCoupon).one().available_coupons == 1
    assert db.query(CouponUse).count() == 1
    replay = client.post(f"/api/billing/payments/{paid['id']}/receipt", json=payload)
    assert replay.status_code == 200 and balance(db).usable_count == 0


def test_one_combined_payment_reserves_one_coupon_across_two_teaching_lines(coupon_env):
    client, db, actor = coupon_env
    second_class(db)
    observation(db)
    verify(db, actor, [group()])
    value = first_payment(client, ids=(11,12))
    assert len(value['lines']) == 2 and db.query(CouponUse).count() == 1
    assert balance(db).reserved_count == 1 and balance(db).usable_count == 0
    assert sum(row['discount_amount'] for row in value['lines']) == 300
    assert sum(row['tuition_amount'] + row['materials_fee'] for row in value['lines']) == value['review']['period']['total_fee']


def test_finite_mixed_value_group_cannot_be_reused_or_borrow_from_another_value(coupon_env):
    client, db, actor = coupon_env
    observation(db, count=2)
    verify(db, actor, [group(200),group(300)])
    first = first_payment(client, count=999)
    result = balance(db)
    assert result.usable_count == 1
    assert {g.value:g.usable_count for g in result.groups} == {200:1,300:0}
    payload = coupon_payload(client, ids=[line['enrollment_id'] for line in first['lines']], value=300, count=999)
    draft, data = confirmation(client, payload=payload, key='duplicate-group-use', draft_key='duplicate-group-draft')
    assert not draft['can_copy']
    assert draft['review']['message']['zh'] is None and draft['review']['message']['en'] is None
    rejected = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert rejected.status_code == 422, rejected.text
    assert db.query(CouponUse).count() == db.query(BillingPayment).count() == 1
    assert balance(db).usable_count == 1


def test_cancelling_unpaid_payment_releases_only_its_one_hold(coupon_env):
    client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    value = first_payment(client)
    body = {'expected_version':value['version'], 'idempotency_key':'release-reservation', 'reason':'Synthetic parent cancellation.'}
    result = client.post(f"/api/billing/payments/{value['id']}/cancel", json=body)
    assert result.status_code == 200, result.text
    assert balance(db).usable_count == 1 and balance(db).uses[0].state == 'released'
    assert client.post(f"/api/billing/payments/{value['id']}/cancel", json=body).status_code == 200
    assert balance(db).usable_count == 1


@pytest.mark.parametrize('receipt_first', [True,False])
def test_import_and_receipt_order_require_explicit_reconciliation_without_double_subtraction(coupon_env, receipt_first):
    client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    value = pay(client, first_payment(client))
    use_id = balance(db).uses[0].id
    if receipt_first:
        response, _ = receipt(client, value)
        assert response.status_code == 200, response.text
        value = response.json()
    observation(db, count=0, observed_on=date(2026,10,18), marker='b')
    assert balance(db, as_of=date(2026,10,18)).usable_count is None
    checked, _ = verify(db, actor, [], reconciliations=[{'use_id':use_id,'included_in_observation':True}], as_of=date(2026,10,18))
    assert checked.usable_count == 0
    if not receipt_first:
        assert checked.uses[0].receipt_reference is None and checked.uses[0].state == 'awaiting_receipt'
        response, _ = receipt(client, value)
        assert response.status_code == 200, response.text
    final = balance(db, as_of=date(2026,10,18))
    assert final.usable_count == 0 and final.uses[0].accounted_in_observation
    assert db.query(CouponUse).count() == 1


def test_new_observation_does_not_reuse_old_verified_detail_groups(coupon_env):
    _client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    assert balance(db).usable_count == 1
    observation(db, count=2, observed_on=date(2026,10,18), marker='c')
    result = balance(db, as_of=date(2026,10,18))
    assert result.usable_count is None and result.groups == []
    assert any(i.code == 'COUPON_DETAILS_REQUIRED' for i in result.issues)


def test_unpaid_reservation_cannot_be_declared_already_consumed_by_new_count(coupon_env):
    client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    first_payment(client)
    use_id = balance(db).uses[0].id
    next_observation = observation(db, count=0, observed_on=date(2026,10,18), marker='d')
    request = CouponVerificationRequest(expected_version=balance(db).version, observation_id=next_observation.id,
        checked_at=datetime(2026,10,18,tzinfo=timezone.utc), groups=[], reason='Synthetic observation review.',
        reconciliations=[{'use_id':use_id,'included_in_observation':True}])
    reviewed = accounting.review_verification(db,101,request,as_of=date(2026,10,18))
    assert not reviewed.can_confirm and any(i.code=='UNPAID_COUPON_INCLUDED' for i in reviewed.issues)
    assert db.query(CouponUse).one().accounted_observation_id is None


def test_verification_cannot_use_another_students_commitment_id(coupon_env):
    client, db, actor = coupon_env
    observed = observation(db)
    request = CouponVerificationRequest(expected_version=1, observation_id=observed.id,
        checked_at=datetime(2026,10,17,tzinfo=timezone.utc), groups=[group()], reason='Synthetic scope check.',
        reconciliations=[{'use_id':'foreign-or-nonexistent-use','included_in_observation':True}])
    reviewed = accounting.review_verification(db,101,request,as_of=DAY)
    assert not reviewed.can_confirm and any(i.code=='COUPON_USE_SCOPE' for i in reviewed.issues)


@pytest.mark.parametrize('selected', [None,False])
def test_receipt_reference_alone_never_proves_coupon_was_selected(coupon_env, selected):
    client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    value = pay(client, first_payment(client))
    body = {'expected_version':value['version'],'idempotency_key':'missing-selected-'+str(selected),
        'receipt_reference':'SYNTHETIC-KMS-ONLY-NUMBER'}
    if selected is not None:
        body['coupon_selected'] = selected
    response = client.post(f"/api/billing/payments/{value['id']}/receipt", json=body)
    assert response.status_code in (409,422), response.text
    assert db.get(BillingPayment,value['id']).receipt_reference is None
    assert balance(db).usable_count == 0 and balance(db).receipt_pending_count == 1


def test_receipt_completion_requires_nonblank_reference(coupon_env):
    client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group()])
    value = pay(client, first_payment(client))
    result,_ = receipt(client,value,reference='   ')
    assert result.status_code in (409,422)
    assert db.get(BillingPayment,value['id']).receipt_reference is None


def test_verified_group_expiry_is_enforced_without_changing_imported_stock(coupon_env):
    _client, db, actor = coupon_env
    observation(db)
    verify(db, actor, [group(expires_on='2026-10-18')])
    assert balance(db).usable_count == 1
    assert balance(db,as_of=date(2026,10,19)).usable_count == 0
    assert balance(db,as_of=date(2026,10,19)).observation.remaining_count == 1


def test_detail_quantities_cannot_exceed_observation_or_duplicate_groups(coupon_env):
    _client, db, _actor = coupon_env
    observed=observation(db)
    request=CouponVerificationRequest(expected_version=1,observation_id=observed.id,
        checked_at=datetime(2026,10,17,tzinfo=timezone.utc),groups=[group(),group()],reason='Synthetic quantity check.')
    reviewed=accounting.review_verification(db,101,request,as_of=DAY)
    assert not reviewed.can_confirm
    assert {'GROUP_COUNT','DUPLICATE_COUPON_GROUP'} <= {i.code for i in reviewed.issues}


def test_storage_off_balance_does_not_read_191_tables(coupon_env,monkeypatch):
    _client,db,_actor=coupon_env
    monkeypatch.setenv('BILLING_COUPON_ENABLED','false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','false')
    def guard(_connection,_cursor,statement,*_args):
        assert 'billing_coupon_' not in statement.lower()
    event.listen(db.bind,'before_cursor_execute',guard)
    try:
        result=balance(db)
        assert not result.storage_available and result.usable_count is None
    finally:
        event.remove(db.bind,'before_cursor_execute',guard)


@pytest.mark.parametrize('new_status',['Cancelled','Pending Payment'])
def test_a_consumed_coupon_stays_held_if_its_source_is_later_cancelled_or_reverted(coupon_env,new_status):
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group()])
    value=pay(client,first_payment(client))
    result,_=receipt(client,value)
    assert result.status_code==200,result.text
    stored=db.get(BillingPayment,value['id'])
    stored.status=new_status
    db.commit()
    result=balance(db)
    assert result.usable_count is None
    assert result.uses[0].state=='receipt_recorded'
    assert any(i.code=='COUPON_SOURCE_REVIEW' for i in result.issues)
    assert not result.uses[0].accounted_in_observation


@pytest.mark.parametrize('late',['payment','known_redemption','unknown_redemption'])
def test_actual_late_money_or_receipt_is_retained_with_a_coupon_dispute(coupon_env,monkeypatch,late):
    from routers import billing_workflow
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group(expires_on='2026-11-20')])
    value=first_payment(client,expires_on='2026-11-20')
    fee=value['review']['period']['total_fee']
    monkeypatch.setattr(billing_workflow,'today',lambda:date(2026,11,22))
    monkeypatch.setattr(accounting,'utc_now',lambda:datetime(2026,11,22,tzinfo=timezone.utc))
    payload=pay_payload(value,payment_date='2026-11-21' if late=='payment' else '2026-10-17')
    response=client.post(f"/api/billing/payments/{value['id']}/paid",json=payload)
    assert response.status_code==200,response.text
    value=response.json()
    if late!='payment':
        response,_=receipt(client,value,used_on='2026-11-21' if late=='known_redemption' else None)
        assert response.status_code==200,response.text
    result=balance(db,as_of=date(2026,11,22))
    assert result.usable_count is None
    expected='COUPON_REDEMPTION_DATE_REVIEW' if late=='unknown_redemption' else 'COUPON_EXPIRY_DISPUTE'
    assert any(i.code==expected for i in result.issues),result.model_dump(mode='json')
    stored=db.get(BillingPayment,value['id'])
    assert stored.status=='Paid' and stored.received_amount==fee
    assert stored.snapshot['review']['period']['total_fee']==fee


@pytest.mark.parametrize('raw',[1.5,-1,'bad','NaN','1,000','=1+1',True])
def test_malformed_import_count_is_never_turned_into_zero(coupon_env,raw):
    from billing.coupon_imports import parse_workbook
    parsed=parse_workbook(workbook([('MSA0010',raw)]))
    assert len(parsed)==1 and parsed[0]['remaining_count'] is None and parsed[0]['error']


@pytest.mark.parametrize('raw',[0,'0','--',None])
def test_verified_zero_markers_are_distinct_from_invalid_counts(coupon_env,raw):
    from billing.coupon_imports import parse_workbook
    parsed=parse_workbook(workbook([('MSA0010',raw)]))
    assert parsed[0]['remaining_count']==0 and parsed[0]['error'] is None


def test_manual_import_preserves_exact_ids_omissions_and_observation_truth(coupon_env):
    from billing import coupon_imports
    from billing.coupon_schemas import CouponImportConfirm
    client,db,actor=coupon_env
    db.get(Student,101).school_student_id='0010'
    db.get(Student,102).school_student_id='10'
    db.add(StudentCoupon(student_id=101,available_coupons=9,coupon_value=300))
    untouched=observation(db,count=3,student_id=102,marker='f')
    db.commit()
    source=workbook([('MSA0010',1),('MSA77777',2)])
    reviewed=coupon_imports.preview_import(db,source,'TerminationList_2099-12.xlsx','MSA',DAY,actor,as_of=DAY)
    db.commit()
    assert reviewed.changed_count==1 and reviewed.unmatched_count==1 and reviewed.invalid_count==0
    matched=[row for row in reviewed.rows if row.student]
    assert len(matched)==1 and matched[0].student.id==101 and matched[0].student.school_student_id=='0010'
    request=CouponImportConfirm(expected_review_hash=reviewed.review_hash,idempotency_key='exact-id-import',acknowledge_unmatched=True)
    result=coupon_imports.apply_import(db,reviewed.id,request,actor,as_of=DAY)
    db.commit()
    assert result.applied
    current=balance(db)
    assert current.observation.remaining_count==1 and current.observation.observed_on==DAY
    assert current.observation.processed_at.date()>=DAY
    assert db.get(CouponAccount,102).observation_id==untouched.id
    assert db.query(StudentCoupon).filter_by(student_id=101).one().available_coupons==9
    replay=coupon_imports.apply_import(db,reviewed.id,request,actor,as_of=DAY)
    db.commit()
    assert replay.id==result.id and db.query(CouponObservation).filter_by(student_id=101).count()==1


def test_same_source_bytes_cannot_be_relabelled_as_a_newer_observation(coupon_env):
    from billing import coupon_imports
    from billing.coupon_schemas import CouponImportConfirm
    client,db,actor=coupon_env
    db.get(Student,101).school_student_id='0010'
    db.commit()
    source=workbook([('MSA0010',1)])
    original=coupon_imports.preview_import(db,source,'first.xlsx','MSA',DAY,actor,as_of=DAY)
    db.commit()
    coupon_imports.apply_import(db,original.id,CouponImportConfirm(expected_review_hash=original.review_hash,
        idempotency_key='established-source-date'),actor,as_of=DAY)
    db.commit()
    repeat=coupon_imports.preview_import(db,source,'renamed.xlsx','MSA',DAY,actor,as_of=DAY)
    assert repeat.id==original.id
    changed=coupon_imports.preview_import(db,source,'renamed-new-date.xlsx','MSA',date(2026,10,18),actor,as_of=date(2026,10,18))
    assert not changed.can_confirm and any(i.code=='SOURCE_DATE_CHANGED' for i in changed.issues)


def test_abandoned_preview_with_wrong_date_does_not_poison_the_real_source_date(coupon_env):
    from billing import coupon_imports
    _client,db,actor=coupon_env
    db.get(Student,101).school_student_id='0010'
    db.commit()
    content=workbook([('MSA0010',1)])
    coupon_imports.preview_import(db,content,'same-file.xlsx','MSA',date(2026,10,16),actor,as_of=DAY)
    db.commit()
    correct=coupon_imports.preview_import(db,content,'same-file.xlsx','MSA',DAY,actor,as_of=DAY)
    db.commit()
    assert correct.can_confirm
    import_apply(db,actor,correct,DAY)
    assert balance(db).observation.observed_on==DAY


@pytest.mark.parametrize('kind',['duplicate_id','numeric_id','wrong_branch','ambiguous_profile'])
def test_ambiguous_or_wrong_scope_import_is_not_applied(coupon_env,kind):
    from billing import coupon_imports
    client,db,actor=coupon_env
    db.get(Student,101).school_student_id='0010'
    rows=[('MSA0010',1)]
    if kind=='duplicate_id':rows.append(('MSA0010',0))
    elif kind=='numeric_id':rows=[(10,1)]
    elif kind=='wrong_branch':rows=[('MSB0010',1)]
    else:db.get(Student,102).school_student_id='0010'
    db.commit()
    reviewed=coupon_imports.preview_import(db,workbook(rows),'synthetic-invalid.xlsx','MSA',DAY,actor,as_of=DAY)
    assert not reviewed.can_confirm and reviewed.invalid_count>0
    assert db.query(CouponObservation).count()==0


@pytest.mark.parametrize('checked_at,allowed',[
    ('2026-10-16T17:00:00+00:00',True),  #17Oct01:00 in Hong Kong.
    ('2026-10-17T17:00:00+00:00',False), #18Oct01:00 is after the stated local day.
])
def test_checked_timestamp_is_compared_with_kms_local_dates(coupon_env,checked_at,allowed):
    _client,db,_actor=coupon_env
    observed=observation(db)
    request=CouponVerificationRequest(expected_version=1,observation_id=observed.id,
        checked_at=datetime.fromisoformat(checked_at),groups=[group()],reason='Synthetic Hong Kong date boundary.')
    result=accounting.review_verification(db,101,request,as_of=DAY)
    assert result.can_confirm is allowed,result.model_dump(mode='json')
    assert any(i.code=='CHECK_DATE' for i in result.issues) is not allowed


def test_unknown_redemption_entry_after_hk_midnight_does_not_hide_expiry(coupon_env,monkeypatch):
    from routers import billing_workflow
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group(expires_on='2026-11-20')])
    value=pay(client,first_payment(client,expires_on='2026-11-20'))
    monkeypatch.setattr(billing_workflow,'today',lambda:date(2026,11,21))
    # This is21Nov01:00HK, after20Nov expiry despite the UTC calendar date.
    monkeypatch.setattr(accounting,'utc_now',lambda:datetime(2026,11,20,17,tzinfo=timezone.utc))
    result,_=receipt(client,value,used_on=None)
    assert result.status_code==200,result.text
    result=balance(db,as_of=date(2026,11,21))
    assert any(i.code=='COUPON_REDEMPTION_DATE_REVIEW' for i in result.issues)
    assert result.usable_count is None


def import_review(db,actor,count,day,*,filename='synthetic-source.xlsx'):
    from billing import coupon_imports
    db.get(Student,101).school_student_id='0010'
    db.commit()
    result=coupon_imports.preview_import(db,workbook([('MSA0010',count)]),filename,'MSA',day,actor,as_of=day)
    db.commit()
    return result


def import_apply(db,actor,reviewed,day,*,same_day=False,key=None):
    from billing import coupon_imports
    from billing.coupon_schemas import CouponImportConfirm
    data=CouponImportConfirm(expected_review_hash=reviewed.review_hash,
        idempotency_key=key or 'independent-source-'+str(uuid4()),acknowledge_same_day=same_day)
    result=coupon_imports.apply_import(db,reviewed.id,data,actor,as_of=day)
    db.commit()
    return result


def test_conflicting_same_day_export_requires_explicit_latest_source_review(coupon_env):
    _client,db,actor=coupon_env
    first=import_review(db,actor,1,DAY)
    import_apply(db,actor,first,DAY)
    second=import_review(db,actor,0,DAY,filename='second-same-day.xlsx')
    assert any(i.code=='SAME_DAY_SOURCE_REVIEW' for row in second.rows for i in row.issues)
    with pytest.raises(DraftConflict):
        import_apply(db,actor,second,DAY)
    db.rollback()
    assert balance(db).observation.remaining_count==1
    applied=import_apply(db,actor,second,DAY,same_day=True)
    assert applied.applied and balance(db).observation.remaining_count==0
    # Replaying the original approved file is historical evidence, not a
    # request to restore its superseded larger balance.
    import_apply(db,actor,first,DAY,key='replay-earlier-approved-source')
    assert balance(db).observation.remaining_count==0


def test_older_source_cannot_undo_newer_observation(coupon_env):
    _client,db,actor=coupon_env
    current=import_review(db,actor,1,DAY)
    import_apply(db,actor,current,DAY)
    older=import_review(db,actor,2,date(2026,10,16))
    assert not older.can_confirm
    assert any(i.code=='OLDER_OBSERVATION' for row in older.rows for i in row.issues)
    assert balance(db).observation.remaining_count==1


def test_import_review_becomes_stale_after_a_coupon_is_reserved(coupon_env):
    client,db,actor=coupon_env
    observation(db,count=2)
    verify(db,actor,[group(quantity=2)])
    incoming=import_review(db,actor,2,date(2026,10,18))
    before=balance(db).observation.id
    first_payment(client,count=2)
    with pytest.raises(DraftConflict):
        import_apply(db,actor,incoming,date(2026,10,18))
    db.rollback()
    assert balance(db).observation.id==before and balance(db).reserved_count==1


@pytest.mark.parametrize('note',['',' \t '])
def test_optional_audit_note_stays_empty_without_losing_checker_and_source_evidence(coupon_env,note):
    _client,db,actor=coupon_env
    observed=observation(db)
    request=CouponVerificationRequest(expected_version=1,observation_id=observed.id,
        checked_at=datetime(2026,10,17,tzinfo=timezone.utc),groups=[group()],reason=note)
    assert request.reason==''
    reviewed=accounting.review_verification(db,101,request,as_of=DAY)
    assert reviewed.can_confirm
    payload=CouponVerificationConfirm(**request.model_dump(),expected_review_hash=reviewed.review_hash,
        idempotency_key='empty-routine-note')
    accounting.verify_coupons(db,101,payload,actor,as_of=DAY)
    db.commit()
    saved=db.query(CouponVerification).one()
    assert saved.reason=='' and saved.checked_by==actor.id
    assert saved.observation_id==observed.id and saved.checked_at is not None


def test_optional_note_does_not_answer_an_unresolved_paid_use(coupon_env):
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group()])
    value=first_payment(client)
    pay(client,value)
    incoming=observation(db,count=0,observed_on=date(2026,10,18),marker='e')
    request=CouponVerificationRequest(expected_version=balance(db,as_of=date(2026,10,18)).version,
        observation_id=incoming.id,checked_at=datetime(2026,10,18,tzinfo=timezone.utc),groups=[],reason='')
    reviewed=accounting.review_verification(db,101,request,as_of=date(2026,10,18))
    assert not reviewed.can_confirm and reviewed.issues
    assert balance(db,as_of=date(2026,10,18)).receipt_pending_count==1
    assert not balance(db,as_of=date(2026,10,18)).uses[0].accounted_in_observation


def test_new_checked_group_version_invalidates_saved_coupon_draft(coupon_env):
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group()])
    preference(client)
    original=client.get('/api/billing/students/101/context').json()['source_fingerprint']
    payload=coupon_payload(client)
    draft,data=confirmation(client,payload=payload,key='stale-checked-group',draft_key='stale-checked-group-draft')
    verify(db,actor,[group()],key='checked-again-same-financial-terms')
    assert client.get('/api/billing/students/101/context').json()['source_fingerprint']!=original
    rejected=client.post(f"/api/billing/drafts/{draft['id']}/confirm",json=data)
    assert rejected.status_code==409,rejected.text
    assert db.query(BillingPayment).count()==0


def test_storage_off_context_shape_and_fingerprint_ignore_hidden_191_changes(coupon_env,monkeypatch):
    client,db,actor=coupon_env
    db.add(StudentCoupon(student_id=101,available_coupons=1,coupon_value=300))
    db.commit()
    monkeypatch.setenv('BILLING_COUPON_ENABLED','false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','false')
    original=client.get('/api/billing/students/101/context').json()
    assert set(original['coupon_snapshot'])=={'remaining_count','cached_value','synced_at_utc','verified'}
    monkeypatch.setenv('BILLING_COUPON_ENABLED','true')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','true')
    observation(db)
    verify(db,actor,[group()])
    monkeypatch.setenv('BILLING_COUPON_ENABLED','false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','false')
    def guard(_connection,_cursor,statement,*_args):
        assert 'billing_coupon_' not in statement.lower()
    event.listen(db.bind,'before_cursor_execute',guard)
    try:
        assert client.get('/api/billing/students/101/context').json()==original
    finally:
        event.remove(db.bind,'before_cursor_execute',guard)


def test_fresh_observation_of_zero_needs_no_value_or_expiry_check(coupon_env):
    _client,db,_actor=coupon_env
    db.add(StudentCoupon(student_id=101,available_coupons=9,coupon_value=300))
    db.commit()
    observation(db,count=0)
    current=balance(db)
    assert current.usable_count==0 and current.groups==[]
    assert current.checked_at is None and not current.issues
    assert current.observation.remaining_count==0


def test_zero_observation_does_not_hide_an_untracked_coupon_commitment(coupon_env,monkeypatch):
    client,db,_actor=coupon_env
    monkeypatch.setenv('BILLING_COUPON_ENABLED','false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','false')
    first_payment(client)
    monkeypatch.setenv('BILLING_COUPON_ENABLED','true')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED','true')
    observation(db,count=0)
    current=balance(db)
    assert current.usable_count is None
    assert any(i.code=='UNTRACKED_COUPON_PAYMENT' for i in current.issues)


def test_zero_observation_keeps_a_paid_coupon_pending_until_explicit_reconciliation(coupon_env):
    client,db,actor=coupon_env
    observation(db)
    verify(db,actor,[group()])
    value=first_payment(client)
    pay(client,value)
    observation(db,count=0,observed_on=date(2026,10,18),marker='z')
    current=balance(db,as_of=date(2026,10,18))
    assert current.usable_count is None and current.receipt_pending_count==1
    assert current.uses[0].accounted_in_observation is False
    assert current.uses[0].receipt_reference is None


@pytest.mark.parametrize('case',['zero','unverified','different_value','different_expiry','different_kind'])
def test_forged_coupon_details_cannot_quote_or_copy_a_fee_message(coupon_env,case):
    client,db,actor=coupon_env
    observation(db,count=0 if case=='zero' else 1)
    if case not in {'zero','unverified'}:
        verify(db,actor,[group()])
    preference(client)
    payload=coupon_payload(client,count=999)
    if case=='different_value':
        payload['scenario']['coupon']['value']=200
    elif case=='different_expiry':
        payload['scenario']['coupon']['expires_on']='2027-06-29'
    elif case=='different_kind':
        payload['scenario']['coupon'].update(kind='staff',value=500)
    reviewed=client.post('/api/billing/students/101/draft-review',json=payload)
    assert reviewed.status_code==200,reviewed.text
    checked=reviewed.json()
    assert checked['period']['deductions']
    assert checked['message']['zh'] is None and checked['message']['en'] is None
    assert checked['message']['blocked_reasons']
    response=client.post('/api/billing/students/101/drafts',json={
        'review':payload,'expected_review_hash':checked['review_hash'],
        'idempotency_key':'blocked-coupon-'+case})
    assert response.status_code==200,response.text
    saved=response.json()
    assert not saved['can_copy']
    assert saved['review']['message']['zh'] is None
    rejected=client.post(f"/api/billing/drafts/{saved['id']}/confirm",json={
        'expected_revision':saved['revision'],'expected_review_hash':saved['review']['review_hash'],
        'expected_preference_version':1,'idempotency_key':'blocked-confirm-'+case})
    assert rejected.status_code in {409,422},rejected.text
    assert db.query(BillingPayment).count()==db.query(CouponUse).count()==0
