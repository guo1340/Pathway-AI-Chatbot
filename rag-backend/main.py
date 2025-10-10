import os
import re
import uuid
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import quote

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

app = FastAPI(title="RAG Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# simple in-memory conversations (replace with redis/db for prod)
CONV: Dict[str, List[Dict[str, Any]]] = {}

# init pipeline
PIPE = RagPipeline.from_disk()


# ---------- models ----------
class ChatIn(BaseModel):
    query: str = Field(..., min_length=1)
    source: Optional[str] = None
    conversation_id: Optional[str] = None


class ChatOut(BaseModel):
    answer: str
    citations: List[Dict[str, str]] = []
    conversation_id: str
# ----------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/reload")
def reload_index():
    PIPE.reload()
    return {"status": "reloaded"}


# ---------- helpers ----------
def _basename_from_path(p: str) -> str:
    p = p.replace("\\", "/")
    return os.path.basename(p)


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

        if url.startswith("file://"):
            cleaned = url.replace("file://", "")
            filename = _basename_from_path(cleaned)
        elif url and not url.startswith("http"):
            # tolerate raw filenames
            filename = _basename_from_path(url)

        # Stable dedupe key: prefer filename; then title; then url
        key = (filename or (title or "") or url).strip().lower()
        if not key:
            continue  # nothing indexable—skip

        # First time we see this key -> add it
        if key not in seen_by_key:
            if filename:
                normalized_url = f"{base}/api/files/{quote(filename)}"
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


@app.post("/api/chat", response_model=ChatOut)
def chat(body: ChatIn, request: Request):
    conv_id = body.conversation_id or f"conv-{uuid.uuid4().hex[:8]}"
    history = CONV.setdefault(conv_id, [])
    history.append({"role": "user", "content": body.query})

    answer, citations = PIPE.answer(body.query)

    # Normalize + dedupe + renumber
    norm_citations, old_to_new = _normalize_citations_with_map(citations, request)
    answer = _renumber_answer_markers(answer, old_to_new)

    history.append({"role": "assistant", "content": answer, "citations": norm_citations})
    return ChatOut(answer=answer, citations=norm_citations, conversation_id=conv_id)


@app.get("/api/files/{name}")
def get_file(name: str):
    """
    Streams a file from DOCS_DIR.
    - Path traversal protected by basename().
    - 'inline' Content-Disposition so browsers open PDFs in a new tab.
    """
    safe = os.path.basename(name)  # prevent ../../ tricks
    path = os.path.join(DOCS_DIR, safe)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "application/pdf" if safe.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{safe}"'}
    )


@app.post("/api/upload")
def upload(file: UploadFile = File(...)):
    # Save into docs dir and reload index
    os.makedirs(DOCS_DIR, exist_ok=True)
    dest = os.path.join(DOCS_DIR, file.filename)
    with open(dest, "wb") as f:
        f.write(file.file.read())
    PIPE.reload()
    return {"status": "ok", "filename": file.filename}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
