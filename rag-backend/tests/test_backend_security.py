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
        "CHAT_MAX_SERVER_CONVERSATIONS": "1000",
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

    @classmethod
    def from_disk(cls):
        return cls()

    def answer(self, query):
        self.answer_calls.append(query)
        if self.fail_answer:
            raise RuntimeError("stub answer failure")
        return "stub answer [1]" if self.citations else "stub answer", self.citations

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
        main.CONV.clear()
        main.PIPE.answer_calls.clear()
        main.PIPE.citations = []
        main.PIPE.fail_answer = False
        main.CHAT_RATE_LIMIT_REQUESTS = 0
        main.CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
        main.CHAT_TRUST_PROXY = False
        main.CHAT_SERVER_HISTORY_MESSAGES = 12
        main.CHAT_MAX_SERVER_CONVERSATIONS = 1000
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

        response = self.client.post(
            "/api/ask",
            headers=auth(self.normal_token),
            json={"query": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["remaining_tokens"], 10)

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

    def test_server_conversation_context_is_bounded_and_user_isolated(self):
        user_a = make_token(["edit_posts"], claims={"sub": "topic-user-a"})
        user_b = make_token(["edit_posts"], claims={"sub": "topic-user-b"})

        first = self.client.post(
            "/api/ask",
            headers=auth(user_a),
            json={"query": "Azusa", "conversation_id": "shared-conversation"},
        )
        self.assertEqual(first.status_code, 200)

        follow_up = self.client.post(
            "/api/ask",
            headers=auth(user_a),
            json={"query": "its history", "conversation_id": "shared-conversation"},
        )
        self.assertEqual(follow_up.status_code, 200)
        contextual_query = main.PIPE.answer_calls[-1]
        self.assertIn(
            "Active topic from the previous user turn: Azusa",
            contextual_query,
        )
        self.assertIn("Assistant: stub answer", contextual_query)

        other_user = self.client.post(
            "/api/ask",
            headers=auth(user_b),
            json={"query": "its history", "conversation_id": "shared-conversation"},
        )
        self.assertEqual(other_user.status_code, 200)
        self.assertEqual(main.PIPE.answer_calls[-1], "its history")

        main.CHAT_SERVER_HISTORY_MESSAGES = 2
        latest = self.client.post(
            "/api/ask",
            headers=auth(user_a),
            json={"query": "latest", "conversation_id": "shared-conversation"},
        )
        self.assertEqual(latest.status_code, 200)
        key = main._conversation_key(
            {"sub": "topic-user-a"}, "shared-conversation"
        )
        self.assertEqual(len(main.CONV[key]), 2)
        self.assertEqual(main.CONV[key][0]["content"], "latest")

        main.CHAT_MAX_SERVER_CONVERSATIONS = 1
        replacement = self.client.post(
            "/api/ask",
            headers=auth(user_a),
            json={"query": "other", "conversation_id": "replacement"},
        )
        self.assertEqual(replacement.status_code, 200)
        self.assertNotIn(key, main.CONV)
        self.assertEqual(len(main.CONV), 1)

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
        expired = make_token(["edit_posts"], -10)
        insufficient = make_token(["read"])

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
        response = self.client.get(
            f"/api/files/protected.txt?token={self.normal_token}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"protected content")
        self.assertEqual(
            self.client.get(f"/api/files/protected.txt?token={expired}").status_code,
            401,
        )
        self.assertEqual(
            self.client.get(
                f"/api/files/protected.txt?token={insufficient}"
            ).status_code,
            403,
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
        citation_base, _, citation_fragment = authenticated_url.partition("#")
        separator = "&" if "?" in citation_base else "?"
        citation_url = f"{citation_base}{separator}token={self.normal_token}"
        if citation_fragment:
            citation_url += f"#{citation_fragment}"
        self.assertTrue(citation_url.endswith("#page=2"))
        self.assertIn("?token=", citation_url)
        citation = self.client.get(citation_url)
        self.assertEqual(citation.status_code, 200)
        self.assertEqual(citation.headers["content-type"], "application/pdf")
        self.assertIn("inline", citation.headers["content-disposition"])

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
            (
                {"CHAT_MAX_SERVER_CONVERSATIONS": "0"},
                "CHAT_MAX_SERVER_CONVERSATIONS",
            ),
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
