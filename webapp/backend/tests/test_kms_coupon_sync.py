"""Scheduled coupon updates use invented records and mocked KMS reads only."""
from contextlib import contextmanager

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import coupon_accounting, kms_preview
from billing.coupon_models import CouponAccount, CouponObservation, KmsCouponCheck
from billing.drafts import DraftConflict
from billing.kms_client import KmsReadError
from models import Student
from tests.test_kms_coupon_apply import (
    env as apply_env, preview_env, coupon_env, workflow_env, draft_env,
    coupon, snapshot,
)


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_):
        assert dialect.name == 'sqlite', 'Scheduled KMS tests refuse external databases.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def env(apply_env, monkeypatch):
    from billing import kms_sync
    from tests.test_kms_coupon_preview import NOW
    monkeypatch.setattr(kms_sync, 'credentials', lambda _: ('invented', 'not-a-secret'))
    monkeypatch.setattr(kms_sync, 'today', lambda: NOW.date())
    monkeypatch.setenv('BILLING_KMS_SYNC_ENABLED', 'true')
    client, db, actor, source = apply_env
    monkeypatch.setenv('BILLING_KMS_SYNC_ACTOR_ID', str(actor.id))
    return db, actor, source


def run(env):
    from billing.kms_sync import sync_branch
    db, actor, _ = env
    return sync_branch(db, 'MSA', actor)


def test_scheduled_run_reads_and_applies_without_a_ui_action(env):
    db, _, _ = env
    result = run(env)
    assert result['branch'] == 'MSA' and result['status'] == 'updated'
    assert result['updated_count'] == 1 and result['held_count'] == 0
    assert db.query(KmsCouponCheck).count() == 1
    assert db.query(CouponObservation).one().remaining_count == 2
    assert db.get(CouponAccount, 101).verification_id


def test_repeated_scheduled_reads_do_not_repeat_inventory_updates(env):
    db, _, _ = env
    first = run(env)
    version = db.get(CouponAccount, 101).version
    second = run(env)
    assert second['status'] == 'up_to_date' and second['updated_count'] == 0
    assert second['check_id'] != first['check_id']
    assert db.query(KmsCouponCheck).count() == 2
    assert db.query(CouponObservation).count() == 1
    assert db.get(CouponAccount, 101).version == version


def test_held_students_do_not_prevent_other_clear_updates(env):
    db, _, source = env
    run(env)
    db.get(Student, 102).school_student_id = '0022'
    db.commit()
    version = db.get(CouponAccount, 101).version
    source[0] = snapshot([coupon(), coupon('CP-X', company_id='MSA0022')])
    result = run(env)
    assert result['updated_count'] == 1 and result['held_count'] == 1
    assert db.get(CouponAccount, 101).version == version
    assert db.get(CouponAccount, 102).verification_id
    assert db.query(CouponObservation).count() == 2


def test_held_only_run_saves_source_without_forcing_application(env):
    db, _, source = env
    run(env)
    version = db.get(CouponAccount, 101).version
    source[0] = snapshot([coupon()])
    result = run(env)
    assert result['status'] == 'needs_review'
    assert result['updated_count'] == 0 and result['held_count'] == 1
    assert db.query(KmsCouponCheck).count() == 2
    assert db.query(CouponObservation).count() == 1
    assert db.get(CouponAccount, 101).version == version


def test_failed_collection_leaves_no_source_or_stock(env, monkeypatch):
    db, _, _ = env
    def fail(*_):
        raise KmsReadError('Synthetic KMS read failure')
    # The fixture creates a lightweight transport object for each call.
    from types import SimpleNamespace
    monkeypatch.setattr(kms_preview, 'KmsClient', lambda _: SimpleNamespace(read=fail))
    with pytest.raises(KmsReadError):
        run(env)
    assert db.query(KmsCouponCheck).count() == 0
    assert db.query(CouponObservation).count() == 0
    assert db.query(CouponAccount).count() == 0


def test_application_failure_keeps_the_source_but_rolls_back_stock(env, monkeypatch):
    db, _, _ = env
    original = coupon_accounting.save_operation
    def fail(*args, **kwargs):
        raise ValueError('Synthetic audit failure')
    monkeypatch.setattr(coupon_accounting, 'save_operation', fail)
    with pytest.raises(ValueError):
        run(env)
    assert db.query(KmsCouponCheck).count() == 1
    assert db.query(CouponObservation).count() == 0
    assert db.query(CouponAccount).count() == 0
    monkeypatch.setattr(coupon_accounting, 'save_operation', original)
    assert run(env)['updated_count'] == 1


@pytest.mark.parametrize('flag', ['BILLING_KMS_SYNC_ENABLED', 'BILLING_KMS_PREVIEW_ENABLED',
    'BILLING_KMS_STOCK_STORAGE_ENABLED', 'BILLING_KMS_APPLY_ENABLED', 'BILLING_COUPON_ENABLED'])
def test_disabled_schedule_prevents_source_reads(env, monkeypatch, flag):
    db, _, _ = env
    monkeypatch.setenv(flag, 'false')
    def unexpected(*_):
        pytest.fail('A disabled schedule must not read KMS.')
    monkeypatch.setattr(kms_preview, 'KmsClient', unexpected)
    with pytest.raises(DraftConflict):
        run(env)
    assert db.query(KmsCouponCheck).count() == 0


def test_running_read_is_skipped_without_reading_or_updating(env, monkeypatch):
    db, _, _ = env
    @contextmanager
    def busy(*_):
        raise kms_preview.KmsCheckBusy('A MSA KMS check is already running. Wait for it to finish.')
        yield
    monkeypatch.setattr(kms_preview, 'check_guard', busy)
    result = run(env)
    assert result['status'] == 'busy' and result['updated_count'] == 0
    assert db.query(KmsCouponCheck).count() == 0



def test_disabled_cli_does_not_open_a_database(env, monkeypatch, capsys):
    from billing import kms_sync
    import database
    monkeypatch.setenv('BILLING_KMS_SYNC_ENABLED', 'false')
    monkeypatch.setattr(database, 'SessionLocal', lambda: pytest.fail('Disabled job must not open a database.'))
    assert kms_sync.main([]) == 1
    assert 'disabled_or_unavailable' in capsys.readouterr().out


def test_cli_runs_other_branch_after_a_failure_without_logging_private_error(env, monkeypatch, capsys):
    from billing import kms_sync
    import database
    db, _, _ = env
    monkeypatch.setattr(database, 'SessionLocal', lambda: db)
    calls = []
    def sync(_db, branch, _actor):
        calls.append(branch)
        if branch == 'MSA':
            raise ValueError('Private upstream data must not enter the job log.')
        return {'branch': branch, 'status': 'up_to_date', 'updated_count': 0, 'held_count': 0}
    monkeypatch.setattr(kms_sync, 'sync_branch', sync)
    assert kms_sync.main([]) == 1
    assert calls == ['MSA', 'MSB']
    output = capsys.readouterr().out
    assert '"status": "failed"' in output and '"branch": "MSB"' in output
    assert 'Private upstream data' not in output



@pytest.mark.parametrize('owner', ['missing', 'not_admin', 'departed'])
def test_cli_refuses_unavailable_automation_owners_before_reading_kms(env, monkeypatch, owner, capsys):
    from billing import kms_sync
    from datetime import timedelta
    import database
    db, actor, _ = env
    if owner == 'missing':
        monkeypatch.setenv('BILLING_KMS_SYNC_ACTOR_ID', '999999')
    elif owner == 'not_admin':
        from models import Tutor
        db.get(Tutor, actor.id).role = 'Tutor'
    else:
        from models import Tutor
        db.get(Tutor, actor.id).departure_effective_on = kms_sync.today() - timedelta(days=1)
    db.commit()
    monkeypatch.setattr(database, 'SessionLocal', lambda: db)
    monkeypatch.setattr(kms_sync, 'sync_branch', lambda *_: pytest.fail('Unavailable owner must not read KMS.'))
    assert kms_sync.main([]) == 1
    assert 'disabled_or_unavailable' in capsys.readouterr().out


def fake_mysql_guard(*, get_result=1, get_error=False, release_result=1, release_error=False):
    from types import SimpleNamespace
    events = []
    def execute(statement, values):
        command = str(statement)
        events.append((command, values['name']))
        if 'RELEASE_LOCK' in command:
            if release_error:
                raise RuntimeError('Synthetic release failure')
            value = release_result
        else:
            if get_error:
                raise RuntimeError('Synthetic uncertain acquisition')
            value = get_result
        return SimpleNamespace(scalar=lambda: value)
    connection = SimpleNamespace(execute=execute, close=lambda: events.append(('close', None)),
                                 invalidate=lambda: events.append(('invalidate', None)))
    bind = SimpleNamespace(dialect=SimpleNamespace(name='mysql'), url=SimpleNamespace(database='synthetic_test'),
                           connect=lambda: connection)
    db = SimpleNamespace(get_bind=lambda: bind)
    return db, events


def test_mysql_guard_keeps_one_connection_and_releases_after_source_or_apply_error(env):
    db, events = fake_mysql_guard()
    with pytest.raises(ValueError, match='Synthetic body failure'):
        with kms_preview.check_guard('MSA', db):
            assert len(events) == 1 and 'GET_LOCK' in events[0][0]
            raise ValueError('Synthetic body failure')
    assert [command for command, _ in events] == ['SELECT GET_LOCK(:name, 0)', 'SELECT RELEASE_LOCK(:name)', 'close']
    assert events[0][1] == events[1][1] and events[0][1].endswith(':MSA')
    # The process mutex must also be released when the body fails.
    with kms_preview.check_guard('MSA', db):
        pass


def test_mysql_guard_busy_skips_body_without_releasing_another_owners_lock(env):
    db, events = fake_mysql_guard(get_result=0)
    with pytest.raises(kms_preview.KmsCheckBusy):
        with kms_preview.check_guard('MSA', db):
            pytest.fail('An occupied branch cannot begin a KMS read.')
    assert [command for command, _ in events] == ['SELECT GET_LOCK(:name, 0)', 'close']


@pytest.mark.parametrize('release_result,release_error', [(0, False), (1, True)])
def test_mysql_guard_discards_a_connection_when_release_is_uncertain(env, release_result, release_error):
    db, events = fake_mysql_guard(release_result=release_result, release_error=release_error)
    with kms_preview.check_guard('MSA', db):
        pass
    assert [command for command, _ in events][-2:] == ['invalidate', 'close']



def test_mysql_guard_discards_connection_after_uncertain_acquisition(env):
    db, events = fake_mysql_guard(get_error=True)
    with pytest.raises(RuntimeError, match='uncertain acquisition'):
        with kms_preview.check_guard('MSA', db):
            pytest.fail('A failed lock acquisition must not read KMS.')
    assert [command for command, _ in events] == ['SELECT GET_LOCK(:name, 0)', 'invalidate', 'close']


def test_cli_accepts_an_active_superadmin_owner(env, monkeypatch):
    from billing import kms_sync
    from models import Tutor
    import database
    db, actor, _ = env
    db.get(Tutor, actor.id).role = 'Super Admin'
    db.commit()
    monkeypatch.setattr(database, 'SessionLocal', lambda: db)
    branches = []
    def sync(_db, branch, owner):
        branches.append(branch)
        assert owner.id == actor.id and owner.tutor_name == 'KMS automatic update'
        return {'branch': branch, 'status': 'up_to_date', 'updated_count': 0, 'held_count': 0}
    monkeypatch.setattr(kms_sync, 'sync_branch', sync)
    assert kms_sync.main(['--branch', 'MSA']) == 0
    assert branches == ['MSA']
