import os
import re
import uuid
import mimetypes
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit
import time
import hmac
import hashlib
import base64
import json
import threading
import sqlite3
from collections import deque
from fastapi import Depends, Header, Query

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from rag import RagPipeline

load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
DOCS_DIR = os.getenv("DOCS_DIR", "./docs")  # used by /api/files route
JWT_SECRET = os.getenv("PATHWAY_RAG_JWT_SECRET", "")
JWT_REQUIRED_CAP = os.getenv("JWT_REQUIRED_CAP", "contributor")
JWT_DASHBOARD_CAP = os.getenv("JWT_DASHBOARD_CAP", "manage_rag")
CHAT_QUERY_MAX_LENGTH = int(os.getenv("CHAT_QUERY_MAX_LENGTH", "4000"))
CHAT_INPUT_TOKEN_LIMIT = int(os.getenv("CHAT_INPUT_TOKEN_LIMIT", "2000"))
CHAT_DAILY_TOKEN_LIMIT = int(os.getenv("CHAT_DAILY_TOKEN_LIMIT", "100000"))
LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "1200"))
JWT_USER_ID_CLAIMS = [
    claim.strip()
    for claim in os.getenv("JWT_USER_ID_CLAIMS", "sub,user_id,id").split(",")
    if claim.strip()
]
TOKEN_USAGE_DB = os.getenv("TOKEN_USAGE_DB", "./data/token_usage.sqlite3")
CHAT_RATE_LIMIT_REQUESTS = int(os.getenv("CHAT_RATE_LIMIT_REQUESTS", "20"))
CHAT_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("CHAT_RATE_LIMIT_WINDOW_SECONDS", "60"))
CHAT_TRUST_PROXY = os.getenv("CHAT_TRUST_PROXY", "false").lower() in {"1", "true", "yes", "on"}
CHAT_SERVER_HISTORY_MESSAGES = int(os.getenv("CHAT_SERVER_HISTORY_MESSAGES", "24"))
CHAT_VISIBLE_EXCHANGES = int(os.getenv("CHAT_VISIBLE_EXCHANGES", "12"))
FILE_TICKET_TTL_SECONDS = int(os.getenv("FILE_TICKET_TTL_SECONDS", "900"))

if CHAT_QUERY_MAX_LENGTH < 1:
    raise ValueError("CHAT_QUERY_MAX_LENGTH must be at least 1")
if CHAT_INPUT_TOKEN_LIMIT < 1:
    raise ValueError("CHAT_INPUT_TOKEN_LIMIT must be at least 1")
if CHAT_DAILY_TOKEN_LIMIT < 1:
    raise ValueError("CHAT_DAILY_TOKEN_LIMIT must be at least 1")
if LLM_MAX_OUTPUT_TOKENS < 1:
    raise ValueError("LLM_MAX_OUTPUT_TOKENS must be at least 1")
if not JWT_USER_ID_CLAIMS:
    raise ValueError("JWT_USER_ID_CLAIMS must contain at least one claim name")
if CHAT_RATE_LIMIT_REQUESTS < 0:
    raise ValueError("CHAT_RATE_LIMIT_REQUESTS cannot be negative")
if CHAT_RATE_LIMIT_REQUESTS and CHAT_RATE_LIMIT_WINDOW_SECONDS < 1:
    raise ValueError("CHAT_RATE_LIMIT_WINDOW_SECONDS must be at least 1")
if CHAT_SERVER_HISTORY_MESSAGES < 2:
    raise ValueError("CHAT_SERVER_HISTORY_MESSAGES must be at least 2")
if CHAT_VISIBLE_EXCHANGES < 1:
    raise ValueError("CHAT_VISIBLE_EXCHANGES must be at least 1")
if FILE_TICKET_TTL_SECONDS < 1:
    raise ValueError("FILE_TICKET_TTL_SECONDS must be at least 1")

app = FastAPI(title="RAG Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CHAT_REQUESTS: Dict[str, deque] = {}
CHAT_REQUESTS_LOCK = threading.Lock()
CONVERSATION_LOCKS: Dict[str, threading.Lock] = {}
CONVERSATION_LOCKS_LOCK = threading.Lock()

# init pipeline
PIPE = RagPipeline.from_disk()


def _usage_db_connection() -> sqlite3.Connection:
    db_path = os.path.abspath(TOKEN_USAGE_DB)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30)
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def _initialize_usage_db() -> None:
    with _usage_db_connection() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_token_usage (
                usage_day TEXT NOT NULL,
                user_key TEXT NOT NULL,
                used_tokens INTEGER NOT NULL,
                PRIMARY KEY (usage_day, user_key)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_state (
                user_key TEXT PRIMARY KEY,
                summary TEXT NOT NULL DEFAULT '',
                summarized_exchanges INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_key TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                citations_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS conversation_messages_user_id
            ON conversation_messages (user_key, id)
            """
        )


_initialize_usage_db()


# ---------- models ----------
class ChatIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=CHAT_QUERY_MAX_LENGTH)
    source: Optional[str] = None
    conversation_id: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None  


class ChatOut(BaseModel):
    answer: str
    citations: List[Dict[str, str]] = []
    conversation_id: str
    remaining_tokens: int


class HistoryOut(BaseModel):
    messages: List[Dict[str, Any]]
    conversation_id: str
    remaining_tokens: int


class BalanceOut(BaseModel):
    remaining_tokens: int


class ClearConversationOut(BaseModel):
    conversation_id: str
    remaining_tokens: int
    summarized: bool
# ----------------------------

def _b64url_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s.encode())

def _verify_jwt_hs256(token: str, required_caps: Optional[List[str]] = None) -> dict:
    """
    Verify HS256 JWT: signature + exp + required capability.
    """
    if not JWT_SECRET:
        # Better to fail closed in production
        raise HTTPException(status_code=500, detail="Server misconfigured (missing JWT secret)")

    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode()

        sig = _b64url_decode(sig_b64)
        expected = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid token")

        payload = json.loads(_b64url_decode(payload_b64))

        exp = int(payload.get("exp", 0))
        if exp <= int(time.time()):
            raise HTTPException(status_code=401, detail="Token expired")

        caps = payload.get("cap", []) or []
        for required_cap in required_caps if required_caps is not None else [JWT_REQUIRED_CAP]:
            if required_cap and required_cap not in caps:
                raise HTTPException(status_code=403, detail="Forbidden")

        return payload

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_auth(authorization: Optional[str] = Header(default=None)) -> dict:
    """
    Read Bearer token from Authorization header.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    return _verify_jwt_hs256(token)

def require_dashboard_auth(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    return _verify_jwt_hs256(token, [JWT_REQUIRED_CAP, JWT_DASHBOARD_CAP])


def require_auth_header(authorization: Optional[str]) -> dict:
    if authorization and authorization.lower().startswith("bearer "):
        jwt = authorization.split(" ", 1)[1].strip()
        return _verify_jwt_hs256(jwt)
    raise HTTPException(status_code=401, detail="Missing token")

def enforce_chat_rate_limit(request: Request) -> None:
    if CHAT_RATE_LIMIT_REQUESTS <= 0:
        return

    client = request.client.host if request.client else "unknown"
    if CHAT_TRUST_PROXY:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            client = forwarded_for.split(",", 1)[0].strip() or client
    route = request.url.path
    key = f"{client}:{route}"
    now = time.monotonic()
    cutoff = now - CHAT_RATE_LIMIT_WINDOW_SECONDS

    with CHAT_REQUESTS_LOCK:
        requests = CHAT_REQUESTS.setdefault(key, deque())
        while requests and requests[0] <= cutoff:
            requests.popleft()

        if len(requests) >= CHAT_RATE_LIMIT_REQUESTS:
            retry_after = max(1, int(CHAT_RATE_LIMIT_WINDOW_SECONDS - (now - requests[0])))
            raise HTTPException(
                status_code=429,
                detail="Too many chat requests. Please try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )

        requests.append(now)

        if len(CHAT_REQUESTS) > 1000:
            stale_keys = [
                bucket_key
                for bucket_key, bucket in CHAT_REQUESTS.items()
                if not bucket or bucket[-1] <= cutoff
            ]
            for stale_key in stale_keys:
                CHAT_REQUESTS.pop(stale_key, None)


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, (len(text.encode("utf-8")) + 3) // 4)


def _frontend_history(body: ChatIn) -> List[Dict[str, str]]:
    history = body.history or []
    if not isinstance(history, list):
        return []
    return [
        {
            "role": "user" if message.get("who") == "you" else "assistant",
            "content": str(message.get("text", "")),
        }
        for message in history[-24:]
        if isinstance(message, dict) and str(message.get("text", "")).strip()
    ]


def _build_query_with_context(
    body: ChatIn,
    server_history: List[Dict[str, Any]],
    summary: str = "",
) -> str:
    prior_messages = server_history or _frontend_history(body)
    recent = prior_messages[-CHAT_SERVER_HISTORY_MESSAGES:]
    if not recent and not summary:
        return body.query

    active_topic = next(
        (
            str(message.get("content", "")).strip()
            for message in reversed(recent)
            if message.get("role") == "user"
            and str(message.get("content", "")).strip()
        ),
        "",
    )
    history_text = "\n".join(
        f"{'User' if message.get('role') == 'user' else 'Assistant'}: "
        f"{str(message.get('content', '')).strip()}"
        for message in recent
        if str(message.get("content", "")).strip()
    )
    topic_text = (
        f"Active topic from the previous user turn: {active_topic[:300]}\n\n"
        if active_topic
        else ""
    )
    summary_text = (
        f"Private summary of earlier conversation:\n{summary}\n\n"
        if summary.strip()
        else ""
    )
    recent_text = (
        f"{topic_text}Recent conversation:\n{history_text}\n\n"
        if recent
        else ""
    )
    return f"{summary_text}{recent_text}User: {body.query}"


def _quota_day() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _quota_user_id(user: Dict[str, Any]) -> str:
    for claim in JWT_USER_ID_CLAIMS:
        value = user.get(claim)
        if value is not None and str(value).strip():
            return str(value).strip()
    raise HTTPException(
        status_code=401,
        detail="Token missing a stable user identity claim",
    )


def _quota_user_key(user: Dict[str, Any]) -> str:
    user_id = _quota_user_id(user)
    return hmac.new(
        JWT_SECRET.encode(),
        user_id.encode(),
        hashlib.sha256,
    ).hexdigest()


def _get_server_history(key: Tuple[str, str]) -> List[Dict[str, Any]]:
    user_key = key[0]
    with _usage_db_connection() as connection:
        rows = connection.execute(
            """
            SELECT role, content, citations_json, created_at
            FROM conversation_messages
            WHERE user_key = ?
            ORDER BY id
            """,
            (user_key,),
        ).fetchall()
    history = []
    for role, content, citations_json, created_at in rows:
        try:
            citations = json.loads(citations_json or "[]")
        except json.JSONDecodeError:
            citations = []
        history.append(
            {
                "role": role,
                "content": content,
                "citations": citations,
                "created_at": created_at,
            }
        )
    return history


def _get_conversation_summary(user_key: str) -> str:
    with _usage_db_connection() as connection:
        row = connection.execute(
            "SELECT summary FROM conversation_state WHERE user_key = ?",
            (user_key,),
        ).fetchone()
    return str(row[0]) if row and row[0] else ""


def _conversation_id(user_key: str) -> str:
    return f"thread-{user_key[:12]}"


def _conversation_lock(user_key: str) -> threading.Lock:
    with CONVERSATION_LOCKS_LOCK:
        return CONVERSATION_LOCKS.setdefault(user_key, threading.Lock())


def _store_server_turn(
    key: Tuple[str, str],
    query: str,
    answer: str,
    citations: List[Dict[str, str]],
) -> None:
    user_key = key[0]
    now = int(time.time())
    with _usage_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO conversation_messages
                (user_key, role, content, citations_json, created_at)
            VALUES (?, 'user', ?, '[]', ?)
            """,
            (user_key, query, now),
        )
        connection.execute(
            """
            INSERT INTO conversation_messages
                (user_key, role, content, citations_json, created_at)
            VALUES (?, 'assistant', ?, ?, ?)
            """,
            (user_key, answer, json.dumps(citations), now),
        )
        connection.execute(
            """
            INSERT INTO conversation_state
                (user_key, summary, summarized_exchanges, updated_at)
            VALUES (?, '', 0, ?)
            ON CONFLICT(user_key) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (user_key, now),
        )


def _messages_for_summary(
    user_key: str, clear_all: bool = False
) -> List[Dict[str, Any]]:
    history = _get_server_history((user_key, "thread"))
    if clear_all:
        return history
    overflow_messages = max(0, len(history) - (CHAT_VISIBLE_EXCHANGES * 2))
    return history[:overflow_messages]


def _summary_input_text(summary: str, messages: List[Dict[str, Any]]) -> str:
    message_text = "\n".join(
        f"{'User' if message['role'] == 'user' else 'Assistant'}: "
        f"{message['content']}"
        for message in messages
    )
    return f"{summary}\n{message_text}".strip()


def _compact_conversation(
    user_key: str,
    messages: List[Dict[str, Any]],
    summary: str,
) -> Tuple[str, int]:
    if not messages:
        return summary, 0

    next_summary = PIPE.summarize(summary, messages)
    if not next_summary.strip():
        raise RuntimeError("Conversation summarization returned an empty result")
    message_count = len(messages)
    summarized_exchanges = message_count // 2
    with _usage_db_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        ids = [
            row[0]
            for row in connection.execute(
                """
                SELECT id
                FROM conversation_messages
                WHERE user_key = ?
                ORDER BY id
                LIMIT ?
                """,
                (user_key, message_count),
            ).fetchall()
        ]
        if len(ids) != message_count:
            connection.rollback()
            raise RuntimeError("Conversation changed during summarization")
        connection.execute(
            """
            INSERT INTO conversation_state
                (user_key, summary, summarized_exchanges, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_key) DO UPDATE SET
                summary = excluded.summary,
                summarized_exchanges =
                    conversation_state.summarized_exchanges
                    + excluded.summarized_exchanges,
                updated_at = excluded.updated_at
            """,
            (user_key, next_summary, summarized_exchanges, int(time.time())),
        )
        placeholders = ",".join("?" for _ in ids)
        connection.execute(
            f"DELETE FROM conversation_messages WHERE id IN ({placeholders})",
            ids,
        )
        connection.commit()
    return next_summary, estimate_tokens(_summary_input_text(summary, messages)) + estimate_tokens(next_summary)


def reserve_daily_tokens(
    user: Dict[str, Any],
    estimated_input_tokens: int,
    reserved_output_tokens: Optional[int] = None,
) -> Tuple[Tuple[str, str], int]:
    user_key = _quota_user_key(user)
    usage_key = (_quota_day(), user_key)
    reservation = (
        estimated_input_tokens
        + max(
            0,
            LLM_MAX_OUTPUT_TOKENS
            if reserved_output_tokens is None
            else reserved_output_tokens,
        )
    )

    connection = _usage_db_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """
            SELECT used_tokens
            FROM daily_token_usage
            WHERE usage_day = ? AND user_key = ?
            """,
            usage_key,
        ).fetchone()
        used = int(row[0]) if row else 0
        remaining = max(0, CHAT_DAILY_TOKEN_LIMIT - used)
        if reservation > remaining:
            connection.rollback()
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Daily token limit exceeded",
                    "remaining_tokens": remaining,
                },
            )
        connection.execute(
            """
            INSERT INTO daily_token_usage (usage_day, user_key, used_tokens)
            VALUES (?, ?, ?)
            ON CONFLICT(usage_day, user_key)
            DO UPDATE SET used_tokens = excluded.used_tokens
            """,
            (*usage_key, used + reservation),
        )
        connection.execute(
            "DELETE FROM daily_token_usage WHERE usage_day < date(?, '-7 days')",
            (usage_key[0],),
        )
        connection.commit()
    finally:
        connection.close()

    return usage_key, reservation


def remaining_daily_tokens(user: Dict[str, Any]) -> int:
    usage_key = (_quota_day(), _quota_user_key(user))
    with _usage_db_connection() as connection:
        row = connection.execute(
            """
            SELECT used_tokens
            FROM daily_token_usage
            WHERE usage_day = ? AND user_key = ?
            """,
            usage_key,
        ).fetchone()
    used = int(row[0]) if row else 0
    return max(0, CHAT_DAILY_TOKEN_LIMIT - used)


def settle_daily_tokens(
    usage_key: Tuple[str, str],
    reservation: int,
    actual_tokens: int,
) -> int:
    connection = _usage_db_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """
            SELECT used_tokens
            FROM daily_token_usage
            WHERE usage_day = ? AND user_key = ?
            """,
            usage_key,
        ).fetchone()
        reserved_total = int(row[0]) if row else reservation
        settled_total = max(0, reserved_total - reservation + actual_tokens)
        connection.execute(
            """
            INSERT INTO daily_token_usage (usage_day, user_key, used_tokens)
            VALUES (?, ?, ?)
            ON CONFLICT(usage_day, user_key)
            DO UPDATE SET used_tokens = excluded.used_tokens
            """,
            (*usage_key, settled_total),
        )
        connection.commit()
        return max(0, CHAT_DAILY_TOKEN_LIMIT - settled_total)
    finally:
        connection.close()


def release_daily_token_reservation(
    usage_key: Tuple[str, str], reservation: int
) -> None:
    connection = _usage_db_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """
            SELECT used_tokens
            FROM daily_token_usage
            WHERE usage_day = ? AND user_key = ?
            """,
            usage_key,
        ).fetchone()
        reserved_total = int(row[0]) if row else reservation
        settled_total = max(0, reserved_total - reservation)
        if settled_total:
            connection.execute(
                """
                UPDATE daily_token_usage
                SET used_tokens = ?
                WHERE usage_day = ? AND user_key = ?
                """,
                (settled_total, *usage_key),
            )
        else:
            connection.execute(
                """
                DELETE FROM daily_token_usage
                WHERE usage_day = ? AND user_key = ?
                """,
                usage_key,
            )
        connection.commit()
    finally:
        connection.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/history", response_model=HistoryOut)
def conversation_history(user=Depends(require_auth)):
    user_key = _quota_user_key(user)
    history = _get_server_history((user_key, "thread"))[
        -(CHAT_VISIBLE_EXCHANGES * 2):
    ]
    messages = [
        {
            "who": "you" if message["role"] == "user" else "ai",
            "text": message["content"],
            "citations": _add_file_tickets(message.get("citations", [])),
            "time": time.strftime(
                "%H:%M",
                time.localtime(int(message.get("created_at", 0))),
            ),
        }
        for message in history
    ]
    return HistoryOut(
        messages=messages,
        conversation_id=_conversation_id(user_key),
        remaining_tokens=remaining_daily_tokens(user),
    )


@app.get("/api/balance", response_model=BalanceOut)
def token_balance(user=Depends(require_auth)):
    return BalanceOut(remaining_tokens=remaining_daily_tokens(user))


@app.post("/api/conversation/clear", response_model=ClearConversationOut)
def clear_conversation(user=Depends(require_auth)):
    user_key = _quota_user_key(user)
    with _conversation_lock(user_key):
        messages = _messages_for_summary(user_key, clear_all=True)
        if not messages:
            return ClearConversationOut(
                conversation_id=_conversation_id(user_key),
                remaining_tokens=remaining_daily_tokens(user),
                summarized=False,
            )

        summary = _get_conversation_summary(user_key)
        summary_input_tokens = estimate_tokens(_summary_input_text(summary, messages))
        usage_key, reservation = reserve_daily_tokens(
            user,
            summary_input_tokens,
        )
        try:
            _, actual_summary_tokens = _compact_conversation(
                user_key,
                messages,
                summary,
            )
            remaining_tokens = settle_daily_tokens(
                usage_key,
                reservation,
                actual_summary_tokens,
            )
            return ClearConversationOut(
                conversation_id=_conversation_id(user_key),
                remaining_tokens=remaining_tokens,
                summarized=True,
            )
        except Exception:
            release_daily_token_reservation(usage_key, reservation)
            raise


@app.post("/api/reload")
def reload_index(user=Depends(require_dashboard_auth)):
    PIPE.reload()
    return {"status": "reloaded"}


# ---------- helpers ----------
def _basename_from_path(p: str) -> str:
    p = p.replace("\\", "/")
    return os.path.basename(p)


def _file_ticket(name: str, expires_at: Optional[int] = None) -> str:
    safe = os.path.basename(name)
    payload = {
        "name": safe,
        "exp": expires_at or int(time.time()) + FILE_TICKET_TTL_SECONDS,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(
        JWT_SECRET.encode(),
        f"file:{encoded}".encode(),
        hashlib.sha256,
    ).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def _verify_file_ticket(ticket: str, name: str) -> None:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfigured")
    try:
        encoded, signature = ticket.split(".", 1)
        expected = hmac.new(
            JWT_SECRET.encode(),
            f"file:{encoded}".encode(),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_b64url_decode(signature), expected):
            raise HTTPException(status_code=401, detail="Invalid file ticket")
        payload = json.loads(_b64url_decode(encoded))
        if payload.get("name") != os.path.basename(name):
            raise HTTPException(status_code=401, detail="Invalid file ticket")
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise HTTPException(status_code=401, detail="File ticket expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid file ticket")


def _add_file_tickets(citations: List[Dict[str, str]]) -> List[Dict[str, str]]:
    ticketed = []
    for citation in citations or []:
        item = dict(citation)
        url = item.get("url") or ""
        parsed = urlsplit(url)
        marker = "/api/files/"
        if marker in parsed.path:
            filename = unquote(parsed.path.split(marker, 1)[1].split("/", 1)[0])
            query = dict(parse_qsl(parsed.query, keep_blank_values=True))
            query.pop("token", None)
            query["file_token"] = _file_ticket(filename)
            item["url"] = urlunsplit(
                (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
            )
        ticketed.append(item)
    return ticketed


def _normalize_citations_with_map(
    citations: List[Dict[str, str]],
    request: Request
) -> Tuple[List[Dict[str, str]], Dict[int, int]]:
    """
    Convert file:// URLs to absolute HTTP URLs pointing to /api/files/{name},
    dedupe by filename/title, and return:
      - normalized citation list
      - map from original 1-based index -> new 1-based index
    """
    out: List[Dict[str, str]] = []
    seen_by_key: Dict[str, int] = {}   # key -> new_index (1-based)
    old_to_new: Dict[int, int] = {}
    base = str(request.base_url).rstrip("/")  # e.g., http://127.0.0.1:8000

    for idx, c in enumerate(citations or [], start=1):  # idx is 1-based
        url = c.get("url") or ""
        title = c.get("title")
        filename: Optional[str] = None
        fragment = ""
        path_url, separator, url_fragment = url.partition("#")
        if separator:
            fragment = f"#{url_fragment}"

        if url.startswith("file://"):
            cleaned = path_url.replace("file://", "")
            filename = _basename_from_path(cleaned)
        elif url and not url.startswith("http"):
            # tolerate raw filenames
            filename = _basename_from_path(path_url)

        # Stable dedupe key: prefer filename; then title; then url
        key = (filename or (title or "") or url).strip().lower()
        if not key:
            continue  # nothing indexable—skip

        # First time we see this key -> add it
        if key not in seen_by_key:
            if filename:
                normalized_url = f"{base}/api/files/{quote(filename)}{fragment}"
                out.append({"title": title or filename, "url": normalized_url})
            else:
                out.append({"title": title, "url": url})
            seen_by_key[key] = len(out)  # new 1-based index

        old_to_new[idx] = seen_by_key[key]

    return out, old_to_new


_num_pat_round = re.compile(r"\((\d+)\)")
_num_pat_square = re.compile(r"\[(\d+)\]")


def _renumber_answer_markers(text: str, old_to_new: Dict[int, int]) -> str:
    """
    Replace (n) and [n] markers with remapped numbers based on old_to_new.
    Unknown numbers are left as-is.
    """

    def repl_round(m: re.Match):
        n = int(m.group(1))
        return f"({old_to_new.get(n, n)})"

    def repl_square(m: re.Match):
        n = int(m.group(1))
        return f"[{old_to_new.get(n, n)}]"

    text = _num_pat_round.sub(repl_round, text)
    text = _num_pat_square.sub(repl_square, text)
    return text
# ----------------------------


@app.get("/api/files/{name}")
def get_file(
    name: str,
    authorization: Optional[str] = Header(default=None),
    file_token: Optional[str] = Query(default=None),
):
    """
    Streams a file from DOCS_DIR.
    - Protects against path traversal.
    - Serves PDFs inline so #page=N anchors work in browsers.
    - Guesses MIME type for other files for correct preview/download behavior.
    """
    safe = os.path.basename(name)  # prevent ../../ tricks
    if authorization:
        require_auth_header(authorization)
    elif file_token:
        _verify_file_ticket(file_token, safe)
    else:
        raise HTTPException(status_code=401, detail="Missing file authorization")

    path = os.path.join(DOCS_DIR, safe)

    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    # Guess MIME type
    mime_type, _ = mimetypes.guess_type(path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # Use inline disposition for PDFs so browser viewers honor #page=N anchors
    headers = {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
    }
    if mime_type == "application/pdf":
        headers["Content-Disposition"] = f'inline; filename="{safe}"'
    else:
        # for non-PDFs, allow download
        headers["Content-Disposition"] = f'attachment; filename="{safe}"'

    return FileResponse(path, media_type=mime_type, headers=headers)

# main.py (replace only the /api/upload route and add a small env at top)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))  # optional soft guard

@app.post("/api/ask", response_model=ChatOut)
def ask(
    body: ChatIn,
    request: Request,
    user=Depends(require_auth),
    _rate_limit=Depends(enforce_chat_rate_limit),
):
    """
    Accepts:
      - query: user question
      - conversation_id: optional existing conversation id
      - history: optional array of past messages [{who: 'you'|'ai', text: str}]
    """
    user_key = _quota_user_key(user)
    with _conversation_lock(user_key):
        conv_id = _conversation_id(user_key)
        conversation_key = (user_key, conv_id)
        server_history = _get_server_history(conversation_key)
        summary = _get_conversation_summary(user_key)
        query_with_history = _build_query_with_context(body, server_history, summary)
        estimated_input_tokens = estimate_tokens(query_with_history)
        if estimated_input_tokens > CHAT_INPUT_TOKEN_LIMIT:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Estimated input is {estimated_input_tokens} tokens; "
                    f"limit is {CHAT_INPUT_TOKEN_LIMIT}"
                ),
            )

        overflow_message_count = max(
            0,
            len(server_history) + 2 - (CHAT_VISIBLE_EXCHANGES * 2),
        )
        summary_messages = server_history[:overflow_message_count]
        summary_input_tokens = (
            estimate_tokens(_summary_input_text(summary, summary_messages))
            if summary_messages
            else 0
        )
        usage_key, reservation = reserve_daily_tokens(
            user,
            estimated_input_tokens + summary_input_tokens,
            reserved_output_tokens=(
                LLM_MAX_OUTPUT_TOKENS * (2 if summary_messages else 1)
            ),
        )

        reservation_active = True
        try:
            answer, citations = PIPE.answer(query_with_history)

            # Normalize and map citations
            norm_citations, old_to_new = _normalize_citations_with_map(citations, request)
            answer = _renumber_answer_markers(answer, old_to_new)

            _store_server_turn(
                conversation_key,
                body.query,
                answer,
                norm_citations,
            )

            actual_summary_tokens = 0
            overflow = _messages_for_summary(user_key)
            if overflow:
                try:
                    _, actual_summary_tokens = _compact_conversation(
                        user_key,
                        overflow,
                        summary,
                    )
                except Exception as exc:
                    print(f"Conversation summarization deferred: {exc}")

            actual_tokens = (
                estimated_input_tokens
                + estimate_tokens(answer)
                + actual_summary_tokens
            )
            remaining_tokens = settle_daily_tokens(
                usage_key,
                reservation,
                actual_tokens,
            )
            reservation_active = False

            return ChatOut(
                answer=answer,
                citations=_add_file_tickets(norm_citations),
                conversation_id=conv_id,
                remaining_tokens=remaining_tokens,
            )
        except Exception:
            if reservation_active:
                release_daily_token_reservation(usage_key, reservation)
            raise


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), user=Depends(require_dashboard_auth)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    filename = os.path.basename(file.filename)
    if os.path.splitext(filename)[1].lower() not in {".md", ".txt", ".html", ".pdf"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    os.makedirs(DOCS_DIR, exist_ok=True)
    dest = os.path.join(DOCS_DIR, filename)
    temp_dest = os.path.join(DOCS_DIR, f".upload-{uuid.uuid4().hex}.tmp")

    size = 0
    chunk_size = 1024 * 1024  # 1MB
    try:
        with open(temp_dest, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                size += len(chunk)
                if MAX_UPLOAD_MB and size > MAX_UPLOAD_MB * 1024 * 1024:
                    # Clean up partial file and abort
                    f.close()
                    try:
                        os.remove(temp_dest)
                    except Exception:
                        pass
                    raise HTTPException(status_code=413, detail="File too large")
                f.write(chunk)
        os.replace(temp_dest, dest)
    except HTTPException:
        raise
    except Exception as e:
        try:
            os.remove(temp_dest)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to save: {e!s}")

    # Incrementally sync the vector index after a successful upload.
    try:
        PIPE.reload()
    except Exception as e:
        # File saved, but indexing failed; surface a useful message
        raise HTTPException(status_code=500, detail=f"Saved but failed to index: {e!s}")

    return {"status": "ok", "filename": filename, "bytes": size}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
