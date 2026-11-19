"""Inbox ordering checks using synthetic SQLite records only."""
from datetime import datetime, timedelta

from models import MessageArchive, ThreadPin, Tutor, TutorMessage
from routers import messages
from tests.test_billing_drafts import env, reject_external_connections


def inbox(env):
    client, session, _ = env
    client.app.include_router(messages.router, prefix='/api')
    session.add(Tutor(id=2, tutor_name='Sender', user_email='sender@example.test', role='Tutor'))
    session.flush()
    for number in range(1, 26):
        session.add(TutorMessage(
            id=number, from_tutor_id=2, to_tutor_id=1,
            subject=f'Chat {number}', message='Synthetic chat',
            category='Reminder' if number % 2 else 'Question',
            created_at=datetime(2026, 11, 1) + timedelta(minutes=number),
        ))
    session.add(ThreadPin(message_id=1, tutor_id=1))
    session.add(ThreadPin(message_id=2, tutor_id=2))
    session.commit()
    return client, session


def test_old_pinned_chat_is_on_first_page_without_duplicate_later(env):
    client, _ = inbox(env)
    first = client.get('/api/messages', params={'tutor_id': 1, 'limit': 20})
    assert first.status_code == 200, first.text
    result = first.json()
    ids = [thread['root_message']['id'] for thread in result['threads']]
    assert ids == [1, *range(25, 6, -1)]
    assert result['threads'][0]['root_message']['is_thread_pinned']
    assert result['total_count'] == 25 and result['has_more']
    last = client.get('/api/messages', params={'tutor_id': 1, 'limit': 20, 'offset': 20}).json()
    assert [thread['root_message']['id'] for thread in last['threads']] == [6, 5, 4, 3, 2]
    assert not last['has_more']


def test_pins_preserve_category_search_and_archive_filters(env):
    client, session = inbox(env)
    for params in ({'category': 'Question'}, {'search': 'Chat 25'}):
        result = client.get('/api/messages', params={'tutor_id': 1, **params})
        assert result.status_code == 200, result.text
        assert all(thread['root_message']['id'] != 1 for thread in result.json()['threads'])
    session.add(MessageArchive(message_id=1, tutor_id=1))
    session.commit()
    result = client.get('/api/messages', params={'tutor_id': 1, 'limit': 1}).json()
    assert result['threads'][0]['root_message']['id'] == 25
    assert result['total_count'] == 24


def test_pinning_a_chat_does_not_grant_access_to_it(env):
    client, session = inbox(env)
    session.get(TutorMessage, 1).to_tutor_id = 2
    session.commit()
    result = client.get('/api/messages', params={'tutor_id': 1, 'limit': 1}).json()
    assert result['threads'][0]['root_message']['id'] == 25
    assert result['total_count'] == 24
