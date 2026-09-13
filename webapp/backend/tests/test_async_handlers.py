"""
Route handlers should only be async when they await something.

FastAPI runs an async handler on the server's single event loop, and a plain
def handler in its thread pool. Almost every handler here uses the synchronous
database session, so an async handler that never awaits blocks the event loop
for as long as its queries take. Every other request on that server waits
behind it, including Cloud Run's health check, which restarts the server when
it gets no answer in time.

So a new handler should be a plain def unless it awaits something, such as an
async HTTP client, a streaming response or an upload being read.

KNOWN lists the async handlers that await nothing and are still async. The
first group schedules live message updates with asyncio.create_task or streams
a response, and needs the event loop. The second does no blocking work, so
the loop costs it nothing. The third has not been reviewed yet. Most of those
write to the database, and a write can behave differently once two requests
are able to run it at the same time, so each wants a look before it moves.

The test fails on a new entry and on a stale one, so when you convert a
handler, take it off the list.
"""
import ast
import pathlib

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "routers"
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "api_route"}

NEEDS_THE_EVENT_LOOP = {
    "debug_admin.py::export_table",
    "messages.py::create_message",
    "messages.py::delete_message",
    "messages.py::get_message_threads",
    "messages.py::get_presence",
    "messages.py::mark_as_read",
    "messages.py::message_stream",
    "messages.py::toggle_like",
    "messages.py::update_message",
}

DOES_NO_BLOCKING_WORK = {
    "auth.py::get_current_user_info",
    "auth.py::get_handoff_token",
    "auth.py::google_login",
    "auth.py::logout",
    "document_processing.py::get_status",
    "document_processing.py::remove_handwriting",
}

NOT_YET_REVIEWED = {
    "auth.py::refresh_token",
    "debug_admin.py::bulk_delete_rows",
    "debug_admin.py::bulk_update_rows",
    "debug_admin.py::create_row",
    "debug_admin.py::delete_row",
    "debug_admin.py::execute_sql_query",
    "debug_admin.py::revert_audit_log",
    "debug_admin.py::update_row",
    "documents.py::apply_solutions_endpoint",
    "documents.py::bulk_update_documents",
    "documents.py::create_checkpoint",
    "documents.py::create_document",
    "documents.py::create_folder",
    "documents.py::create_variant_document_endpoint",
    "documents.py::delete_document",
    "documents.py::delete_folder",
    "documents.py::delete_tag",
    "documents.py::delete_version",
    "documents.py::duplicate_document",
    "documents.py::empty_trash",
    "documents.py::extract_questions",
    "documents.py::heartbeat_document",
    "documents.py::lock_document",
    "documents.py::permanently_delete_document",
    "documents.py::rename_tag",
    "documents.py::restore_version",
    "documents.py::toggle_star",
    "documents.py::unlock_document",
    "documents.py::update_document",
    "documents.py::update_folder",
    "enrollments.py::apply_schedule_change",
    "enrollments.py::batch_mark_paid",
    "enrollments.py::batch_mark_sent",
    "enrollments.py::batch_renew",
    "enrollments.py::batch_renew_check",
    "enrollments.py::cancel_enrollment",
    "enrollments.py::clear_discount_override",
    "enrollments.py::create_enrollment",
    "enrollments.py::preview_enrollment",
    "enrollments.py::preview_schedule_change",
    "enrollments.py::set_discount_override",
    "enrollments.py::update_enrollment",
    "enrollments.py::update_enrollment_extension",
    "exam_revision.py::create_revision_slot",
    "exam_revision.py::delete_revision_slot",
    "exam_revision.py::enroll_student",
    "exam_revision.py::get_revision_slot_detail",
    "exam_revision.py::remove_enrollment",
    "exam_revision.py::sync_revision_slot",
    "exam_revision.py::trigger_calendar_sync",
    "exam_revision.py::update_revision_slot",
    "extension_requests.py::approve_extension_request",
    "extension_requests.py::create_extension_request",
    "extension_requests.py::mark_session_rescheduled",
    "extension_requests.py::reject_extension_request",
    "homework.py::delete_homework_file",
    "homework.py::mark_homework",
    "makeup_proposals.py::approve_slot",
    "makeup_proposals.py::cancel_proposal",
    "makeup_proposals.py::create_proposal",
    "makeup_proposals.py::reject_proposal",
    "makeup_proposals.py::reject_slot",
    "makeup_proposals.py::update_slot",
    "messages.py::archive_messages",
    "messages.py::cancel_scheduled_message",
    "messages.py::create_template",
    "messages.py::delete_template",
    "messages.py::mark_all_read",
    "messages.py::mark_as_unread",
    "messages.py::mute_threads",
    "messages.py::pin_messages",
    "messages.py::snooze_threads",
    "messages.py::thread_pin_messages",
    "messages.py::thread_unpin_messages",
    "messages.py::unarchive_messages",
    "messages.py::unmute_threads",
    "messages.py::unpin_messages",
    "messages.py::unsnooze_threads",
    "messages.py::update_template",
    "parent_communications.py::create_communication",
    "parent_communications.py::create_communications_bulk",
    "parent_communications.py::delete_communication",
    "parent_communications.py::update_communication",
    "parent_communications.py::update_location_settings",
    "path_aliases.py::create_path_alias",
    "path_aliases.py::delete_path_alias",
    "sessions.py::bulk_assign_exercises",
    "sessions.py::cancel_makeup",
    "sessions.py::create_calendar_event",
    "sessions.py::delete_calendar_event",
    "sessions.py::get_session_detail",
    "sessions.py::mark_session_attended",
    "sessions.py::mark_session_no_show",
    "sessions.py::mark_session_rescheduled",
    "sessions.py::mark_session_sick_leave",
    "sessions.py::mark_session_weather_cancelled",
    "sessions.py::rate_session",
    "sessions.py::redo_session_status",
    "sessions.py::save_session_exercises",
    "sessions.py::schedule_makeup",
    "sessions.py::sync_calendar",
    "sessions.py::undo_session_status",
    "sessions.py::update_calendar_event",
    "sessions.py::update_session",
    "students.py::create_student",
    "students.py::update_student",
    "terminations.py::delete_termination_record",
    "terminations.py::update_termination_record",
    "tutor_memos.py::create_memo",
    "tutor_memos.py::delete_memo",
    "tutor_memos.py::import_memo_to_session",
    "tutor_memos.py::link_memo_to_session",
    "tutor_memos.py::update_memo",
    "wecom.py::update_webhook",
}

KNOWN = NEEDS_THE_EVENT_LOOP | DOES_NO_BLOCKING_WORK | NOT_YET_REVIEWED


def _own_nodes(fn):
    """The nodes of a function's body, leaving out any functions nested in it."""
    stack = list(fn.body)
    while stack:
        node = stack.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            # An await inside a nested function, such as a streaming generator,
            # belongs to that function and does not free the handler itself.
            continue
        yield node
        stack.extend(ast.iter_child_nodes(node))


def _async_handlers_that_never_await():
    found = set()
    for path in sorted(ROUTERS.glob("*.py")):
        for fn in ast.parse(path.read_text(encoding="utf-8")).body:
            if not isinstance(fn, ast.AsyncFunctionDef):
                continue
            is_route = any(
                isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in ROUTE_METHODS
                for d in fn.decorator_list
            )
            awaits = any(isinstance(n, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for n in _own_nodes(fn))
            if is_route and not awaits:
                found.add(f"{path.name}::{fn.name}")
    return found


def test_no_new_async_handler_blocks_the_event_loop():
    new = _async_handlers_that_never_await() - KNOWN
    assert not new, (
        "These route handlers are async but never await, so they hold the event loop "
        "while they work. Make them plain def: " + ", ".join(sorted(new))
    )


def test_the_known_list_has_no_stale_entries():
    stale = KNOWN - _async_handlers_that_never_await()
    assert not stale, "These handlers no longer need listing in KNOWN: " + ", ".join(sorted(stale))
