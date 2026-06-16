import base64
import hashlib
import hmac
import importlib
import json
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
from starlette.requests import Request


BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_ROOT = Path(tempfile.mkdtemp(prefix="pathway-security-"))
DOCS_DIR = TEST_ROOT / "docs"
DOCS_DIR.mkdir()

os.environ.update(
    {
        "PATHWAY_RAG_JWT_SECRET": "security-test-secret",
        "JWT_REQUIRED_CAP": "edit_posts",
        "JWT_DASHBOARD_CAP": "manage_rag",
        "DOCS_DIR": str(DOCS_DIR),
        "CHAT_QUERY_MAX_LENGTH": "12",
        "CHAT_INPUT_TOKEN_LIMIT": "1000",
        "CHAT_DAILY_TOKEN_LIMIT": "100000",
        "LLM_MAX_OUTPUT_TOKENS": "1200",
        "JWT_USER_ID_CLAIMS": "sub,user_id,id",
        "TOKEN_USAGE_DB": str(TEST_ROOT / "token_usage.sqlite3"),
        "CHAT_RATE_LIMIT_REQUESTS": "20",
        "CHAT_RATE_LIMIT_WINDOW_SECONDS": "60",
        "CHAT_TRUST_PROXY": "false",
        "CHAT_SERVER_HISTORY_MESSAGES": "12",
        "CHAT_VISIBLE_EXCHANGES": "12",
        "CORS_ORIGINS": (
            "http://localhost:5173,http://localhost:3000,"
            "https://main.d2wlgxponag5j6.amplifyapp.com,"
            "https://chat.pathway.training,https://pathway.training"
        ),
    }
)


class StubPipeline:
    def __init__(self):
        self.answer_calls = []
        self.reload_calls = 0
        self.citations = []
        self.fail_answer = False
        self.fail_summary = False
        self.empty_summary = False
        self.summary_calls = 0
        self.summary_delay = 0

    @classmethod
    def from_disk(cls):
        return cls()

    def answer(self, query):
        self.answer_calls.append(query)
        if self.fail_answer:
            raise RuntimeError("stub answer failure")
        return "stub answer [1]" if self.citations else "stub answer", self.citations

    def summarize(self, existing_summary, messages):
        self.summary_calls += 1
        if self.summary_delay:
            time.sleep(self.summary_delay)
        if self.fail_summary:
            raise RuntimeError("stub summary failure")
        if self.empty_summary:
            return ""
        folded = " | ".join(message["content"] for message in messages)
        return f"{existing_summary} | {folded}".strip(" |")

    def reload(self):
        self.reload_calls += 1


stub_rag = types.ModuleType("rag")
stub_rag.RagPipeline = StubPipeline
sys.modules["rag"] = stub_rag
sys.path.insert(0, str(BACKEND_DIR))
previous_cwd = Path.cwd()
os.chdir(TEST_ROOT)
main = importlib.import_module("main")
os.chdir(previous_cwd)


def make_token(caps, exp_offset=300, claims=None):
    def encode(value):
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    header = encode({"alg": "HS256", "typ": "JWT"})
    payload_data = {
        "exp": int(time.time()) + exp_offset,
        "cap": caps,
    }
    if claims is None:
        payload_data["sub"] = "security-test-user"
    else:
        payload_data.update(claims)
    payload = encode(payload_data)
    signing_input = f"{header}.{payload}"
    signature = hmac.new(
        main.JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{signing_input}.{encoded_signature}"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def request_for(ip, forwarded_for=None):
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/ask",
            "raw_path": b"/api/ask",
            "query_string": b"",
            "headers": headers,
            "client": (ip, 1234),
            "server": ("test", 80),
            "scheme": "http",
        }
    )


class BackendSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)
        cls.normal_token = make_token(["edit_posts"])
        cls.dashboard_token = make_token(["edit_posts", "manage_rag"])

    def setUp(self):
        main.CHAT_REQUESTS.clear()
        main.PIPE.answer_calls.clear()
        main.PIPE.citations = []
        main.PIPE.fail_answer = False
        main.PIPE.fail_summary = False
        main.PIPE.empty_summary = False
        main.PIPE.summary_calls = 0
        main.PIPE.summary_delay = 0
        main.CONVERSATION_LOCKS.clear()
        main.CHAT_RATE_LIMIT_REQUESTS = 0
        main.CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
        main.CHAT_TRUST_PROXY = False
        main.CHAT_SERVER_HISTORY_MESSAGES = 12
        main.CHAT_VISIBLE_EXCHANGES = 12
        main.FILE_TICKET_TTL_SECONDS = 900
        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM conversation_messages")
            connection.execute("DELETE FROM conversation_state")
        main.CHAT_INPUT_TOKEN_LIMIT = 1000
        main.CHAT_DAILY_TOKEN_LIMIT = 100000
        main.LLM_MAX_OUTPUT_TOKENS = 1200
        main.JWT_USER_ID_CLAIMS = ["sub", "user_id", "id"]
        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM daily_token_usage")
        for path in DOCS_DIR.iterdir():
            path.unlink()

    def test_dashboard_only_upload_and_reload(self):
        response = self.client.post("/api/reload")
        self.assertEqual(response.status_code, 401)
        response = self.client.post(
            "/api/upload", files={"file": ("x.txt", b"x", "text/plain")}
        )
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/api/reload", headers=auth(self.normal_token))
        self.assertEqual(response.status_code, 403)
        response = self.client.post(
            "/api/upload",
            headers=auth(self.normal_token),
            files={"file": ("x.txt", b"x", "text/plain")},
        )
        self.assertEqual(response.status_code, 403)

        response = self.client.post("/api/reload", headers=auth(self.dashboard_token))
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            "/api/upload",
            headers=auth(self.dashboard_token),
            files={
                "file": (
                    "security-upload.txt",
                    b"temporary security test",
                    "text/plain",
                )
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue((DOCS_DIR / "security-upload.txt").exists())

        response = self.client.post(
            "/api/ask", headers=auth(self.normal_token), json={"query": "hello"}
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.post("/api/reload", headers=auth(self.normal_token))
        self.assertEqual(response.status_code, 403)

    def test_query_length_validation(self):
        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "x" * 12},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(main.PIPE.answer_calls), before + 1)

        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "x" * 13},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(main.PIPE.answer_calls), before)

    def test_estimated_input_token_limit(self):
        main.CHAT_INPUT_TOKEN_LIMIT = 3
        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "x" * 12},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(main.PIPE.answer_calls), before + 1)

        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM conversation_messages")
        main.CHAT_INPUT_TOKEN_LIMIT = 2
        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "x" * 12},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Estimated input is 3 tokens", response.json()["detail"])
        self.assertEqual(len(main.PIPE.answer_calls), before)

        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM conversation_messages")
        main.CHAT_INPUT_TOKEN_LIMIT = 5
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={
                "query": "ok",
                "history": [{"who": "you", "text": "x" * 12}],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(main.PIPE.answer_calls), before)

    def test_daily_user_token_balance_and_response(self):
        main.CHAT_DAILY_TOKEN_LIMIT = 20
        main.LLM_MAX_OUTPUT_TOKENS = 5

        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["remaining_tokens"], 15)

        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM conversation_messages")
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["remaining_tokens"], 10)

        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM conversation_messages")
        other_user = make_token(["edit_posts"], claims={"user_id": 42})
        response = self.client.post(
            "/api/ask",
            headers=auth(other_user),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["remaining_tokens"], 15)

        missing_identity = make_token(["edit_posts"], claims={})
        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(missing_identity),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(len(main.PIPE.answer_calls), before)

    def test_history_reports_remaining_daily_tokens(self):
        main.CHAT_DAILY_TOKEN_LIMIT = 20
        main.LLM_MAX_OUTPUT_TOKENS = 5

        ask = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(ask.status_code, 200)
        expected_remaining = ask.json()["remaining_tokens"]
        self.assertEqual(expected_remaining, 15)

        history = self.client.get("/api/history", headers=auth(self.normal_token))
        self.assertEqual(history.status_code, 200)
        self.assertIn("remaining_tokens", history.json())
        self.assertEqual(history.json()["remaining_tokens"], expected_remaining)

        balance = self.client.get("/api/balance", headers=auth(self.normal_token))
        self.assertEqual(balance.status_code, 200)
        self.assertEqual(balance.json()["remaining_tokens"], expected_remaining)

        fresh_user = make_token(["edit_posts"], claims={"user_id": 4242})
        fresh_history = self.client.get("/api/history", headers=auth(fresh_user))
        self.assertEqual(fresh_history.status_code, 200)
        self.assertEqual(fresh_history.json()["messages"], [])
        self.assertEqual(
            fresh_history.json()["remaining_tokens"],
            main.CHAT_DAILY_TOKEN_LIMIT,
        )
        self.assertEqual(
            self.client.get("/api/balance", headers=auth(fresh_user)).json()[
                "remaining_tokens"
            ],
            main.CHAT_DAILY_TOKEN_LIMIT,
        )

    def test_daily_token_reservation_rejection_release_and_reset(self):
        main.CHAT_DAILY_TOKEN_LIMIT = 4
        main.LLM_MAX_OUTPUT_TOKENS = 3
        before = len(main.PIPE.answer_calls)
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"]["remaining_tokens"], 4)
        self.assertEqual(len(main.PIPE.answer_calls), before)

        main.CHAT_DAILY_TOKEN_LIMIT = 20
        main.LLM_MAX_OUTPUT_TOKENS = 5
        main.PIPE.fail_answer = True
        with self.assertRaises(RuntimeError):
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "hello"},
            )
        with main._usage_db_connection() as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM daily_token_usage"
            ).fetchone()[0]
        self.assertEqual(count, 0)

        main.PIPE.fail_answer = False
        main.PIPE.citations = [{"title": 123, "url": ""}]
        with self.assertRaises(AttributeError):
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "hello"},
            )
        with main._usage_db_connection() as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM daily_token_usage"
            ).fetchone()[0]
        self.assertEqual(count, 0)
        main.PIPE.citations = []

        with patch.object(main, "_quota_day", return_value="2026-06-07"):
            usage_key, reservation = main.reserve_daily_tokens(
                {"sub": "daily-reset-user"}, 2
            )
            remaining = main.settle_daily_tokens(usage_key, reservation, 5)
            self.assertEqual(remaining, 15)
        with patch.object(main, "_quota_day", return_value="2026-06-08"):
            usage_key, reservation = main.reserve_daily_tokens(
                {"sub": "daily-reset-user"}, 2
            )
            remaining = main.settle_daily_tokens(usage_key, reservation, 5)
            self.assertEqual(remaining, 15)

    def test_daily_token_storage_persistence_and_atomic_reservations(self):
        main.CHAT_DAILY_TOKEN_LIMIT = 6
        main.LLM_MAX_OUTPUT_TOKENS = 2
        user = {"sub": "persistent-user"}

        usage_key, reservation = main.reserve_daily_tokens(user, 1)
        remaining = main.settle_daily_tokens(usage_key, reservation, 3)
        self.assertEqual(remaining, 3)

        main._initialize_usage_db()
        with main._usage_db_connection() as connection:
            stored = connection.execute(
                """
                SELECT used_tokens
                FROM daily_token_usage
                WHERE usage_day = ? AND user_key = ?
                """,
                usage_key,
            ).fetchone()[0]
        self.assertEqual(stored, 3)

        with main._usage_db_connection() as connection:
            connection.execute("DELETE FROM daily_token_usage")

        def reserve_once():
            try:
                return main.reserve_daily_tokens(user, 1)
            except main.HTTPException as exc:
                return exc.status_code

        with ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(lambda _: reserve_once(), range(3)))

        self.assertEqual(sum(isinstance(result, tuple) for result in results), 2)
        self.assertEqual(results.count(429), 1)
        with main._usage_db_connection() as connection:
            stored = connection.execute(
                "SELECT used_tokens FROM daily_token_usage"
            ).fetchone()[0]
        self.assertEqual(stored, 6)

    def test_removed_chat_endpoint_and_ask_authentication(self):
        before = len(main.PIPE.answer_calls)
        self.assertEqual(
            self.client.post("/api/chat", json={"query": "hello"}).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth("bad.token.value"),
                json={"query": "hello"},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(make_token(["read"])),
                json={"query": "hello"},
            ).status_code,
            403,
        )
        self.assertEqual(len(main.PIPE.answer_calls), before)

        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(main.PIPE.answer_calls), before + 1)

    def test_durable_conversation_summary_history_and_clear_are_user_isolated(self):
        user_a = make_token(["edit_posts"], claims={"sub": "topic-user-a"})
        user_b = make_token(["edit_posts"], claims={"sub": "topic-user-b"})
        main.CHAT_VISIBLE_EXCHANGES = 2

        for query in ("Azusa", "its history", "latest"):
            response = self.client.post(
                "/api/ask",
                headers=auth(user_a),
                json={"query": query, "conversation_id": "ignored-client-id"},
            )
            self.assertEqual(response.status_code, 200)

        history = self.client.get("/api/history", headers=auth(user_a))
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.json()["messages"]), 4)
        self.assertEqual(history.json()["messages"][0]["text"], "its history")
        self.assertTrue(history.json()["conversation_id"].startswith("thread-"))

        user_key = main._quota_user_key({"sub": "topic-user-a"})
        self.assertIn("Azusa", main._get_conversation_summary(user_key))

        other_history = self.client.get("/api/history", headers=auth(user_b))
        self.assertEqual(other_history.status_code, 200)
        self.assertEqual(other_history.json()["messages"], [])

        cleared = self.client.post(
            "/api/conversation/clear",
            headers=auth(user_a),
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertTrue(cleared.json()["summarized"])
        self.assertEqual(
            self.client.get("/api/history", headers=auth(user_a)).json()["messages"],
            [],
        )
        self.assertIn("latest", main._get_conversation_summary(user_key))

        resumed = self.client.post(
            "/api/ask",
            headers=auth(user_a),
            json={"query": "remember?"},
        )
        self.assertEqual(resumed.status_code, 200)
        self.assertIn(
            "Private summary of earlier conversation",
            main.PIPE.answer_calls[-1],
        )
        self.assertIn("Azusa", main.PIPE.answer_calls[-1])

    def test_exact_visible_window_restart_and_summary_failure_safety(self):
        user = make_token(["edit_posts"], claims={"sub": "summary-window-user"})
        main.CHAT_VISIBLE_EXCHANGES = 12
        main.CHAT_DAILY_TOKEN_LIMIT = 100000
        main.LLM_MAX_OUTPUT_TOKENS = 5
        with main._usage_db_connection() as connection:
            connection.execute(
                """
                INSERT INTO daily_token_usage (usage_day, user_key, used_tokens)
                VALUES ('2099-01-01', 'schema-check', 7)
                """
            )
        main._initialize_usage_db()
        with main._usage_db_connection() as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            self.assertIn("conversation_state", tables)
            self.assertIn("conversation_messages", tables)
            self.assertEqual(
                connection.execute(
                    """
                    SELECT used_tokens FROM daily_token_usage
                    WHERE usage_day = '2099-01-01' AND user_key = 'schema-check'
                    """
                ).fetchone()[0],
                7,
            )

        for index in range(12):
            response = self.client.post(
                "/api/ask",
                headers=auth(user),
                json={"query": f"turn-{index + 1}"},
            )
            self.assertEqual(response.status_code, 200)

        history = self.client.get("/api/history", headers=auth(user)).json()
        self.assertEqual(len(history["messages"]), 24)
        self.assertEqual(main.PIPE.summary_calls, 0)
        before_thirteenth = response.json()["remaining_tokens"]

        thirteenth = self.client.post(
            "/api/ask",
            headers=auth(user),
            json={"query": "turn-13"},
        )
        self.assertEqual(thirteenth.status_code, 200)
        self.assertEqual(main.PIPE.summary_calls, 1)
        self.assertLess(thirteenth.json()["remaining_tokens"], before_thirteenth)
        history = self.client.get("/api/history", headers=auth(user)).json()
        self.assertEqual(len(history["messages"]), 24)
        self.assertEqual(history["messages"][0]["text"], "turn-2")

        user_key = main._quota_user_key({"sub": "summary-window-user"})
        summary_before_restart = main._get_conversation_summary(user_key)
        self.assertIn("turn-1", summary_before_restart)
        main._initialize_usage_db()
        self.assertEqual(
            main._get_conversation_summary(user_key),
            summary_before_restart,
        )
        self.assertEqual(
            len(self.client.get("/api/history", headers=auth(user)).json()["messages"]),
            24,
        )

        failing_user = make_token(
            ["edit_posts"], claims={"sub": "summary-failure-user"}
        )
        main.CHAT_VISIBLE_EXCHANGES = 1
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(failing_user),
                json={"query": "first"},
            ).status_code,
            200,
        )
        main.PIPE.fail_summary = True
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(failing_user),
                json={"query": "second"},
            ).status_code,
            200,
        )
        self.assertEqual(
            len(
                main._get_server_history(
                    (main._quota_user_key({"sub": "summary-failure-user"}), "thread")
                )
            ),
            4,
        )

        main.PIPE.fail_summary = False
        main.PIPE.empty_summary = True
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(failing_user),
                json={"query": "third"},
            ).status_code,
            200,
        )
        self.assertEqual(
            len(
                main._get_server_history(
                    (main._quota_user_key({"sub": "summary-failure-user"}), "thread")
                )
            ),
            6,
        )

    def test_clear_noop_quota_and_failure_preserve_history(self):
        empty_user = make_token(["edit_posts"], claims={"sub": "empty-clear-user"})
        before_calls = main.PIPE.summary_calls
        empty_clear = self.client.post(
            "/api/conversation/clear",
            headers=auth(empty_user),
        )
        self.assertEqual(empty_clear.status_code, 200)
        self.assertFalse(empty_clear.json()["summarized"])
        self.assertEqual(main.PIPE.summary_calls, before_calls)

        user = make_token(["edit_posts"], claims={"sub": "clear-quota-user"})
        main.CHAT_DAILY_TOKEN_LIMIT = 100
        main.LLM_MAX_OUTPUT_TOKENS = 5
        sent = self.client.post(
            "/api/ask",
            headers=auth(user),
            json={"query": "keep"},
        )
        self.assertEqual(sent.status_code, 200)
        before_clear = sent.json()["remaining_tokens"]
        cleared = self.client.post(
            "/api/conversation/clear",
            headers=auth(user),
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertLess(cleared.json()["remaining_tokens"], before_clear)
        self.assertEqual(
            self.client.get("/api/history", headers=auth(user)).json()["messages"],
            [],
        )

        blocked_user = make_token(
            ["edit_posts"], claims={"sub": "blocked-clear-user"}
        )
        main.CHAT_DAILY_TOKEN_LIMIT = 20
        sent = self.client.post(
            "/api/ask",
            headers=auth(blocked_user),
            json={"query": "keep"},
        )
        self.assertEqual(sent.status_code, 200)
        main.CHAT_DAILY_TOKEN_LIMIT = 6
        blocked = self.client.post(
            "/api/conversation/clear",
            headers=auth(blocked_user),
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(
            len(
                self.client.get(
                    "/api/history", headers=auth(blocked_user)
                ).json()["messages"]
            ),
            2,
        )

        failing_user = make_token(
            ["edit_posts"], claims={"sub": "failed-clear-user"}
        )
        main.CHAT_DAILY_TOKEN_LIMIT = 100
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(failing_user),
                json={"query": "keep"},
            ).status_code,
            200,
        )
        main.PIPE.fail_summary = True
        with self.assertRaises(RuntimeError):
            self.client.post(
                "/api/conversation/clear",
                headers=auth(failing_user),
            )
        self.assertEqual(
            len(
                self.client.get(
                    "/api/history", headers=auth(failing_user)
                ).json()["messages"]
            ),
            2,
        )

    def test_concurrent_same_user_requests_preserve_summary_order(self):
        user = make_token(["edit_posts"], claims={"sub": "concurrent-summary-user"})
        main.CHAT_VISIBLE_EXCHANGES = 1
        main.CHAT_DAILY_TOKEN_LIMIT = 100000
        main.LLM_MAX_OUTPUT_TOKENS = 5
        main.PIPE.summary_delay = 0.05

        first = self.client.post(
            "/api/ask",
            headers=auth(user),
            json={"query": "first"},
        )
        self.assertEqual(first.status_code, 200)

        def send(query):
            return self.client.post(
                "/api/ask",
                headers=auth(user),
                json={"query": query},
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(send, ("second", "third")))
        self.assertTrue(all(response.status_code == 200 for response in responses))

        user_key = main._quota_user_key({"sub": "concurrent-summary-user"})
        summary = main._get_conversation_summary(user_key)
        self.assertIn("first", summary)
        self.assertTrue("second" in summary or "third" in summary)
        history = self.client.get("/api/history", headers=auth(user)).json()["messages"]
        self.assertEqual(len(history), 2)

    def test_rate_limiting(self):
        main.CHAT_RATE_LIMIT_REQUESTS = 2
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "one"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "two"},
            ).status_code,
            200,
        )
        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "three"},
        )
        self.assertEqual(response.status_code, 429)
        self.assertGreaterEqual(int(response.headers["Retry-After"]), 1)

        main.CHAT_RATE_LIMIT_REQUESTS = 1
        main.CHAT_REQUESTS.clear()
        self.assertEqual(
            self.client.post(
                "/api/ask", headers=auth(self.normal_token), json={"query": "ask"}
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/ask", headers=auth(self.normal_token), json={"query": "ask"}
            ).status_code,
            429,
        )

        main.CHAT_RATE_LIMIT_WINDOW_SECONDS = 1
        main.CHAT_REQUESTS.clear()
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "wait"},
            ).status_code,
            200,
        )
        time.sleep(1.1)
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "again"},
            ).status_code,
            200,
        )

        main.CHAT_RATE_LIMIT_REQUESTS = 0
        main.CHAT_REQUESTS.clear()
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "free"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/ask",
                headers=auth(self.normal_token),
                json={"query": "free"},
            ).status_code,
            200,
        )

    def test_rate_limit_client_and_proxy_buckets(self):
        main.CHAT_RATE_LIMIT_REQUESTS = 1
        main.enforce_chat_rate_limit(request_for("10.0.0.1"))
        main.enforce_chat_rate_limit(request_for("10.0.0.2"))
        self.assertEqual(len(main.CHAT_REQUESTS), 2)

        main.CHAT_REQUESTS.clear()
        main.enforce_chat_rate_limit(request_for("10.0.0.1", "203.0.113.1"))
        with self.assertRaises(main.HTTPException) as caught:
            main.enforce_chat_rate_limit(request_for("10.0.0.1", "203.0.113.2"))
        self.assertEqual(caught.exception.status_code, 429)

        main.CHAT_TRUST_PROXY = True
        main.CHAT_REQUESTS.clear()
        main.enforce_chat_rate_limit(
            request_for("10.0.0.1", "203.0.113.1, 10.0.0.1")
        )
        main.enforce_chat_rate_limit(
            request_for("10.0.0.1", "203.0.113.2, 10.0.0.1")
        )
        self.assertEqual(len(main.CHAT_REQUESTS), 2)

    def test_protected_document_access(self):
        protected = DOCS_DIR / "protected.txt"
        protected.write_text("protected content", encoding="utf-8")

        self.assertEqual(
            self.client.get("/api/files/protected.txt").status_code, 401
        )
        self.assertEqual(
            self.client.get(
                "/api/files/protected.txt", headers=auth("bad.token.value")
            ).status_code,
            401,
        )
        response = self.client.get(
            "/api/files/protected.txt", headers=auth(self.normal_token)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"protected content")
        self.assertEqual(
            self.client.get(
                f"/api/files/protected.txt?token={self.normal_token}"
            ).status_code,
            401,
        )
        ticket = main._file_ticket("protected.txt")
        response = self.client.get(
            f"/api/files/protected.txt?file_token={ticket}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"protected content")
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        self.assertEqual(
            self.client.get(
                f"/api/files/other.txt?file_token={ticket}"
            ).status_code,
            401,
        )
        expired_ticket = main._file_ticket(
            "protected.txt", expires_at=int(time.time()) - 1
        )
        self.assertEqual(
            self.client.get(
                f"/api/files/protected.txt?file_token={expired_ticket}"
            ).status_code,
            401,
        )
        response = self.client.get(
            "/api/files/..%2Foutside.txt", headers=auth(self.normal_token)
        )
        self.assertIn(response.status_code, {404, 422})

    def test_cors_and_citation_release_boundaries(self):
        protected = DOCS_DIR / "release guide.pdf"
        protected.write_bytes(b"%PDF-1.4 release guide")
        main.PIPE.citations = [
            {
                "title": "Release Guide p.2",
                "url": f"file://{protected}#page=2",
            }
        ]

        approved = self.client.options(
            "/api/ask",
            headers={
                "Origin": "https://chat.pathway.training",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(
            approved.headers.get("access-control-allow-origin"),
            "https://chat.pathway.training",
        )

        rejected = self.client.options(
            "/api/ask",
            headers={
                "Origin": "https://unapproved.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIsNone(rejected.headers.get("access-control-allow-origin"))

        public_chat = self.client.post("/api/ask", json={"query": "citation"})
        self.assertEqual(public_chat.status_code, 401)

        authenticated_chat = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "citation"},
        )
        self.assertEqual(authenticated_chat.status_code, 200)
        authenticated_url = authenticated_chat.json()["citations"][0]["url"]
        self.assertTrue(authenticated_url.endswith("#page=2"))
        self.assertIn("?file_token=", authenticated_url)
        self.assertNotIn("?token=", authenticated_url)
        self.assertNotIn(self.normal_token, authenticated_url)
        citation = self.client.get(authenticated_url)
        self.assertEqual(citation.status_code, 200)
        self.assertEqual(citation.headers["content-type"], "application/pdf")
        self.assertIn("inline", citation.headers["content-disposition"])

        history_url = self.client.get(
            "/api/history", headers=auth(self.normal_token)
        ).json()["messages"][-1]["citations"][0]["url"]
        self.assertIn("?file_token=", history_url)
        self.assertEqual(self.client.get(history_url).status_code, 200)

    def test_invalid_configuration_fails_startup(self):
        script = (
            "import sys,types;"
            "r=types.ModuleType('rag');"
            "r.RagPipeline=type('P',(),{'from_disk':classmethod(lambda cls: cls())});"
            "sys.modules['rag']=r;"
            f"sys.path.insert(0,{str(BACKEND_DIR)!r});"
            "import main"
        )
        cases = [
            ({"CHAT_QUERY_MAX_LENGTH": "0"}, "CHAT_QUERY_MAX_LENGTH"),
            ({"CHAT_INPUT_TOKEN_LIMIT": "0"}, "CHAT_INPUT_TOKEN_LIMIT"),
            ({"CHAT_DAILY_TOKEN_LIMIT": "0"}, "CHAT_DAILY_TOKEN_LIMIT"),
            ({"LLM_MAX_OUTPUT_TOKENS": "0"}, "LLM_MAX_OUTPUT_TOKENS"),
            ({"JWT_USER_ID_CLAIMS": ""}, "JWT_USER_ID_CLAIMS"),
            ({"CHAT_RATE_LIMIT_REQUESTS": "-1"}, "CHAT_RATE_LIMIT_REQUESTS"),
            (
                {
                    "CHAT_RATE_LIMIT_REQUESTS": "1",
                    "CHAT_RATE_LIMIT_WINDOW_SECONDS": "0",
                },
                "CHAT_RATE_LIMIT_WINDOW_SECONDS",
            ),
            (
                {"CHAT_SERVER_HISTORY_MESSAGES": "1"},
                "CHAT_SERVER_HISTORY_MESSAGES",
            ),
            ({"CHAT_VISIBLE_EXCHANGES": "0"}, "CHAT_VISIBLE_EXCHANGES"),
            ({"FILE_TICKET_TTL_SECONDS": "0"}, "FILE_TICKET_TTL_SECONDS"),
        ]
        for overrides, expected in cases:
            env = os.environ.copy()
            env.update(overrides)
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=TEST_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(expected, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
