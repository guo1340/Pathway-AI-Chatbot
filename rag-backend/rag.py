import os, uuid, glob, html
import hashlib
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass
import re

from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain.schema import Document
from langchain_community.document_loaders import TextLoader, BSHTMLLoader, PyPDFLoader

# LLM + embeddings (OpenAI or Ollama)
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_ollama import ChatOllama, OllamaEmbeddings
from urllib.parse import quote

load_dotenv()

# ------- config -------
DOCS_DIR = os.getenv("DOCS_DIR", "./docs")
CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_store")
CHUNK_MAX_SIZE = int(os.getenv("CHUNK_MAX_SIZE", os.getenv("CHUNK_SIZE", "600")))
CHUNK_MIN_SIZE = int(os.getenv("CHUNK_MIN_SIZE", "200"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
PDF_OCR_ENABLED = os.getenv("PDF_OCR_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
PDF_OCR_ENGINE = os.getenv("PDF_OCR_ENGINE", "auto").lower()
PDF_OCR_MIN_TEXT_CHARS = int(os.getenv("PDF_OCR_MIN_TEXT_CHARS", "40"))
PDF_OCR_DPI = int(os.getenv("PDF_OCR_DPI", "200"))
PDF_OCR_LANGUAGE = os.getenv("PDF_OCR_LANGUAGE", "eng")
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()
TOP_K = int(os.getenv("TOP_K", "4"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()

if CHUNK_MIN_SIZE < 1 or CHUNK_MIN_SIZE > CHUNK_MAX_SIZE:
    raise ValueError("CHUNK_MIN_SIZE must be between 1 and CHUNK_MAX_SIZE")
if CHUNK_OVERLAP < 0 or CHUNK_OVERLAP >= CHUNK_MAX_SIZE:
    raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_MAX_SIZE")
if PDF_OCR_MIN_TEXT_CHARS < 0:
    raise ValueError("PDF_OCR_MIN_TEXT_CHARS cannot be negative")
if PDF_OCR_DPI < 72:
    raise ValueError("PDF_OCR_DPI must be at least 72")
if PDF_OCR_ENGINE not in {"auto", "tesseract", "rapidocr"}:
    raise ValueError("PDF_OCR_ENGINE must be auto, tesseract, or rapidocr")

# OpenAI defaults
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# Ollama defaults
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

STOPWORDS = {
    "the","a","an","of","and","or","to","in","on","for","with","as","by","is","are",
    "be","that","this","it","its","at","from","about","into","over","under","between",
    "without","within","their","his","her","our","your","my","we","you","they"
}

def _basename(doc: Document) -> str:
    src = (doc.metadata or {}).get("source", "") or ""
    return os.path.basename(src)

def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()

def _query_keywords(q: str) -> List[str]:
    # simple, universal keyword extractor
    toks = re.findall(r"[a-zA-Z][a-zA-Z\-']{2,}", q.lower())
    return [t for t in toks if t not in STOPWORDS]

def _hits(text: str, kws: List[str]) -> int:
    t = _normalize(text)
    return sum(1 for k in kws if k in t)

def _majority_source(docs: List[Document]) -> Optional[str]:
    if not docs:
        return None
    counts: Dict[str, int] = {}
    for d in docs:
        b = _basename(d)
        counts[b] = counts.get(b, 0) + 1
    # pick the basename that appears most
    return max(counts, key=counts.get)

def iterative_retrieve(self, query: str, k: int = TOP_K, max_passes: int = 3) -> List[Document]:
    """
    Attempt multi-pass retrieval when the first batch might be incomplete.
    Each pass excludes previously seen sources/pages.
    """
    all_docs = []
    seen_keys = set()

    for pass_i in range(max_passes):
        # Retrieve as usual
        new_docs = self.retrieve(query, k=k)

        # Filter out duplicates (same source + page)
        unique = []
        for d in new_docs:
            key = (d.metadata.get("source"), d.metadata.get("page"))
            if key not in seen_keys:
                seen_keys.add(key)
                unique.append(d)

        # Stop if we are not finding anything new
        if not unique:
            break

        all_docs.extend(unique)

        # 🔍 If the retrieved docs already cover many unique sections (e.g. 10+ chunks), stop early
        if len(all_docs) >= k * 2:
            break

    # Limit to k final documents (you can choose len(all_docs) if you prefer to feed all)
    return all_docs[:k]


# ------- helpers -------
def _supported_file_paths(path: str) -> List[str]:
    paths: List[str] = []
    for extension in ("md", "txt", "html", "pdf"):
        paths.extend(glob.glob(os.path.join(path, "**", f"*.{extension}"), recursive=True))
    return sorted(set(paths))

_RAPID_OCR = None

def _ocr_image(image) -> Tuple[str, str]:
    tesseract_error = None
    if PDF_OCR_ENGINE in {"auto", "tesseract"}:
        try:
            import pytesseract

            if TESSERACT_CMD:
                pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
            pytesseract.get_tesseract_version()
            return (
                pytesseract.image_to_string(image, lang=PDF_OCR_LANGUAGE).strip(),
                "tesseract",
            )
        except Exception as exc:
            tesseract_error = exc
            if PDF_OCR_ENGINE == "tesseract":
                raise RuntimeError(
                    "Scanned PDF OCR requires the Tesseract executable. Install "
                    "Tesseract and set TESSERACT_CMD if it is not available on PATH."
                ) from exc

    if PDF_OCR_ENGINE in {"auto", "rapidocr"}:
        try:
            import numpy as np
            from rapidocr_onnxruntime import RapidOCR

            global _RAPID_OCR
            if _RAPID_OCR is None:
                _RAPID_OCR = RapidOCR()
            result, _ = _RAPID_OCR(np.asarray(image))
            text = "\n".join(line[1] for line in (result or []) if len(line) > 1)
            return text.strip(), "rapidocr"
        except Exception as exc:
            raise RuntimeError(
                "Scanned PDF OCR failed. Install the locked RapidOCR dependencies "
                "or configure a working Tesseract executable."
            ) from exc

    raise RuntimeError("Scanned PDF OCR is not configured") from tesseract_error

def _load_pdf_docs(fp: str) -> List[Document]:
    native_docs = PyPDFLoader(fp).load()
    if not PDF_OCR_ENABLED:
        return [doc for doc in native_docs if (doc.page_content or "").strip()]

    pages_needing_ocr = [
        index
        for index, doc in enumerate(native_docs)
        if len((doc.page_content or "").strip()) < PDF_OCR_MIN_TEXT_CHARS
    ]
    if not pages_needing_ocr:
        return native_docs

    try:
        import fitz
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Scanned PDF pages require pymupdf and Pillow. Run `uv sync` "
            "after updating dependencies."
        ) from exc

    with fitz.open(fp) as pdf:
        for index in pages_needing_ocr:
            page_number = native_docs[index].metadata.get("page", index)
            if not isinstance(page_number, int) or page_number < 0 or page_number >= len(pdf):
                page_number = index

            page = pdf.load_page(page_number)
            pixmap = page.get_pixmap(dpi=PDF_OCR_DPI, alpha=False)
            image = Image.frombytes(
                "RGB",
                (pixmap.width, pixmap.height),
                pixmap.samples,
            )
            text, engine = _ocr_image(image)
            if text:
                native_docs[index].page_content = text
                native_docs[index].metadata["ocr"] = True
                native_docs[index].metadata["ocr_engine"] = engine

    return [doc for doc in native_docs if (doc.page_content or "").strip()]

def _load_docs_from_file(fp: str) -> List[Document]:
    docs: List[Document] = []
    extension = os.path.splitext(fp)[1].lower()

    if extension in {".md", ".txt"}:
        loader = TextLoader(fp, encoding="utf-8")
    elif extension == ".html":
        loader = BSHTMLLoader(fp, open_encoding="utf-8")
    elif extension == ".pdf":
        loaded = _load_pdf_docs(fp)
        for d in loaded:
            d.metadata["source"] = fp
            docs.append(d)
        return docs
    else:
        return docs

    try:
        loaded = loader.load()
    except Exception:
        return docs

    for d in loaded:
        d.metadata["source"] = fp
        docs.append(d)
    return docs

def _load_docs_from_dir(path: str) -> List[Document]:
    docs: List[Document] = []
    for fp in _supported_file_paths(path):
        docs.extend(_load_docs_from_file(fp))
    return docs

def _join_chunk_text(left: str, right: str) -> str:
    max_overlap = min(CHUNK_OVERLAP, len(left), len(right))
    for overlap in range(max_overlap, 0, -1):
        if left.endswith(right[:overlap]):
            return left + right[overlap:]
    return f"{left}\n\n{right}"

def _merge_small_chunks(chunks: List[Document]) -> List[Document]:
    merged: List[Document] = []
    pending: Optional[Document] = None

    for chunk in chunks:
        if pending is None:
            pending = chunk
            continue

        combined = _join_chunk_text(pending.page_content, chunk.page_content)
        if len(pending.page_content) < CHUNK_MIN_SIZE and len(combined) <= CHUNK_MAX_SIZE:
            pending = Document(page_content=combined, metadata=dict(pending.metadata))
            continue

        merged.append(pending)
        pending = chunk

    if pending is not None:
        if merged and len(pending.page_content) < CHUNK_MIN_SIZE:
            combined = _join_chunk_text(merged[-1].page_content, pending.page_content)
            if len(combined) <= CHUNK_MAX_SIZE:
                merged[-1] = Document(
                    page_content=combined,
                    metadata=dict(merged[-1].metadata),
                )
            else:
                merged.append(pending)
        else:
            merged.append(pending)

    return merged

def _split(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_MAX_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks: List[Document] = []
    for doc in docs:
        chunks.extend(_merge_small_chunks(splitter.split_documents([doc])))
    return chunks

def _source_key(path: str) -> str:
    return os.path.normcase(os.path.abspath(path))

def _file_hash(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def _chunk_config() -> str:
    return f"{CHUNK_MIN_SIZE}:{CHUNK_MAX_SIZE}:{CHUNK_OVERLAP}"

def _index_config(path: str) -> str:
    config = _chunk_config()
    if os.path.splitext(path)[1].lower() == ".pdf":
        return (
            f"{config}:pdf-ocr:{PDF_OCR_ENABLED}:{PDF_OCR_ENGINE}:{PDF_OCR_MIN_TEXT_CHARS}:"
            f"{PDF_OCR_DPI}:{PDF_OCR_LANGUAGE}"
        )
    return config

def _prepare_file_chunks(path: str, fingerprint: str) -> Tuple[List[Document], List[str]]:
    chunks = _split(_load_docs_from_file(path))
    source_key = _source_key(path)
    chunk_config = _chunk_config()
    index_config = _index_config(path)
    ids: List[str] = []

    for index, chunk in enumerate(chunks):
        chunk.metadata["source"] = path
        chunk.metadata["source_key"] = source_key
        chunk.metadata["source_hash"] = fingerprint
        chunk.metadata["chunk_config"] = chunk_config
        chunk.metadata["index_config"] = index_config
        chunk.metadata["chunk_index"] = index
        chunk_id = hashlib.sha256(
            f"{source_key}\0{fingerprint}\0{index_config}\0{index}\0{chunk.page_content}".encode("utf-8")
        ).hexdigest()
        ids.append(chunk_id)

    return chunks, ids

def _build_embeddings():
    if LLM_PROVIDER == "ollama":
        return OllamaEmbeddings(model=OLLAMA_EMBED_MODEL)
    return OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL)

def _build_llm():
    if LLM_PROVIDER == "ollama":
        return ChatOllama(model=OLLAMA_MODEL, temperature=TEMPERATURE)
    return ChatOpenAI(model=OPENAI_MODEL, temperature=TEMPERATURE)

@dataclass
class RagPipeline:
    llm: any
    vectordb: Chroma

    @classmethod
    def from_disk(cls) -> "RagPipeline":
        embeddings = _build_embeddings()
        os.makedirs(CHROMA_DIR, exist_ok=True)
        vectordb = Chroma(
            embedding_function=embeddings,
            persist_directory=CHROMA_DIR,
            collection_name="site-docs",
        )
        llm = _build_llm()
        pipeline = cls(llm=llm, vectordb=vectordb)
        if not vectordb.get(limit=1).get("ids"):
            pipeline.reload()
        return pipeline

    def reload(self):
        current_files = {
            _source_key(path): path
            for path in _supported_file_paths(DOCS_DIR)
        }
        indexed = self.vectordb.get(include=["metadatas"])
        indexed_sources: Dict[str, Dict[str, Any]] = {}

        for chunk_id, metadata in zip(
            indexed.get("ids", []),
            indexed.get("metadatas", []),
        ):
            metadata = metadata or {}
            source = metadata.get("source")
            if not source:
                continue
            source_key = metadata.get("source_key") or _source_key(source)
            state = indexed_sources.setdefault(
                source_key,
                {"ids": [], "hashes": set(), "index_configs": set()},
            )
            state["ids"].append(chunk_id)
            if metadata.get("source_hash"):
                state["hashes"].add(metadata["source_hash"])
            index_config = metadata.get("index_config") or metadata.get("chunk_config")
            if index_config:
                state["index_configs"].add(index_config)

        summary = {"added": 0, "updated": 0, "deleted": 0, "unchanged": 0}

        for source_key, path in current_files.items():
            fingerprint = _file_hash(path)
            previous = indexed_sources.get(source_key)
            if (
                previous
                and previous["hashes"] == {fingerprint}
                and previous["index_configs"] == {_index_config(path)}
            ):
                summary["unchanged"] += 1
                continue

            chunks, chunk_ids = _prepare_file_chunks(path, fingerprint)
            if not chunks:
                continue

            # Add first so an embedding failure leaves the previous index intact.
            self.vectordb.add_documents(chunks, ids=chunk_ids)
            if previous:
                old_ids = [chunk_id for chunk_id in previous["ids"] if chunk_id not in chunk_ids]
                if old_ids:
                    self.vectordb.delete(ids=old_ids)
                summary["updated"] += 1
            else:
                summary["added"] += 1

        for source_key, previous in indexed_sources.items():
            if source_key not in current_files:
                self.vectordb.delete(ids=previous["ids"])
                summary["deleted"] += 1

        return summary

    def retrieve(self, query: str, k: int = TOP_K) -> List[Document]:
        """
        Universal retrieval that:
        • uses high-recall initial search
        • adds neighbor chunks from same source (context stitching)
        • applies generic junk + footnote filtering
        • prefers majority source to stabilize multi-page topics
        """
        FOOTNOTE_PAT = re.compile(
            r"(?:\bwww\.[^\s]+|\bhttps?://[^\s]+|\baccessed\s+\w+|\bvol\.\s*\d+|\bp\.\s*\d+|\bdoi:)",
            re.I
        )

        # Step 1 – Wide recall pool
        retriever = self.vectordb.as_retriever(search_kwargs={"k": k * 4})
        raw = retriever.invoke(query)

        # Step 2 – Generic cleanup
        cleaned = []
        for d in raw:
            txt = (d.page_content or "").strip()
            low = txt.lower()
            if not txt or len(txt) < 60:
                continue
            if re.search(r"(table of contents|copyright|all rights reserved|printed on)", low):
                continue
            if re.fullmatch(r"\d+", low):
                continue
            if len(txt) < 500 and FOOTNOTE_PAT.search(low):
                continue
            cleaned.append(d)

        if not cleaned:
            return raw[:k]

        # Step 3 – Keyword overlap
        kws = _query_keywords(query)
        if kws:
            overlap = [d for d in cleaned if _hits(d.page_content, kws) >= 2]
            if not overlap:
                overlap = [d for d in cleaned if _hits(d.page_content, kws) >= 1]
            pool = overlap if overlap else cleaned
        else:
            pool = cleaned

        # Step 4 – Add neighbors from same source (context stitching)
        neighbors: List[Document] = []
        seen = set()
        for d in pool[: k * 2]:
            src = d.metadata.get("source")
            if not src or src in seen:
                continue
            seen.add(src)
            page = d.metadata.get("page") or d.metadata.get("page_number")
            if page is not None:
                for adj in (page - 1, page + 1):
                    key = {"source": src, "page": adj}
                    # Use the persistent collection to pull that neighbor if present
                    try:
                        neighbor_docs = self.vectordb._collection.get(
                            where=key,
                            limit=1
                        )
                        if neighbor_docs and neighbor_docs["documents"]:
                            ndoc = Document(
                                page_content=neighbor_docs["documents"][0],
                                metadata={"source": src, "page": adj}
                            )
                            neighbors.append(ndoc)
                    except Exception:
                        continue
        pool.extend(neighbors)

        # Step 5 – Majority source preference
        maj = _majority_source(pool)
        if maj:
            primary = [d for d in pool if _basename(d) == maj]
            others  = [d for d in pool if _basename(d) != maj]
            if len(primary) >= max(2, len(pool) // 2):
                pool = primary + others[:max(0, k - len(primary))]

        # Step 6 – Return final k (after dedup)
        unique = []
        seen_keys = set()
        for d in pool:
            key = (_basename(d), d.metadata.get("page"))
            if key not in seen_keys:
                seen_keys.add(key)
                unique.append(d)

        return unique[:k]


    def _expand_adjacent_pages(self, docs: List[Document], window: int = 2) -> List[Document]:
        """
        Expand context by adding nearby pages from the same PDF when multiple
        results cluster tightly (e.g., all from p.26–30). This helps capture
        continuation of enumerations or multi-page lists.
        """
        if not docs:
            return docs

        expanded = list(docs)
        sources = {d.metadata.get("source") for d in docs if d.metadata.get("source")}
        all_meta = self.vectordb._collection.get(include=["metadatas", "documents"])

        for src in sources:
            # Extract all pages for this source from the index
            entries = [
                (m.get("page"), m.get("source"), d)
                for m, d in zip(all_meta["metadatas"], all_meta["documents"])
                if m.get("source") == src and "page" in m
            ]

            # Get current pages already retrieved
            current_pages = [d.metadata.get("page") for d in docs if d.metadata.get("source") == src]
            if not current_pages:
                continue

            min_p, max_p = min(current_pages), max(current_pages)
            target_range = set(range(min_p - window, max_p + window + 1))

            # Add chunks whose page number is adjacent
            for page, s, content in entries:
                if page in target_range and all(p != page for p in current_pages):
                    new_doc = Document(page_content=content, metadata={"source": s, "page": page})
                    expanded.append(new_doc)

        return expanded


    def answer(self, query: str, k: int = TOP_K) -> Tuple[str, List[Dict[str, str]]]:
        ctx_docs = iterative_retrieve(self, query, k=k, max_passes=3)
        print(f"⚙️ Running LLM for query: {query}, retrieved {len(ctx_docs)} context docs")
        ctx_docs = self._expand_adjacent_pages(ctx_docs, window=2)
        # Optional minor quality filter to drop obviously irrelevant junk
        ctx_docs = [d for d in ctx_docs if len(d.page_content.split()) > 10]
        if not ctx_docs:
            ctx_docs = self.retrieve(query, k=k)  # retry without the soft filter if emptied
        
        # Sort context docs by page number (if available) to preserve logical order
        ctx_docs.sort(key=lambda d: d.metadata.get("page", d.metadata.get("page_number", 0)))
        
        # Build the numbered context block that the LLM will cite as [n]
        context = "\n\n".join(
            f"[{i+1}] {d.page_content.strip()}" for i, d in enumerate(ctx_docs)
        )

        # --- Save context to local file ---
        # try:
        #     with open("context.txt", "a", encoding="utf-8") as f:
        #         f.write("=" * 80 + "\n")
        #         f.write(f"🧠 Query: {query}\n")
        #         f.write("-" * 80 + "\n")
        #         f.write("📄 Context Sent to Model:\n")
        #         f.write(context)
        #         f.write("\n" + "=" * 80 + "\n\n")
        # except Exception as e:
        #     print(f"⚠️ Failed to write context.txt: {e}")


        # Build richer citations: include page numbers and add #page=N to URLs
        citations = []
        for d in ctx_docs:
            src = d.metadata.get("source", "") or ""
            base = os.path.basename(src) or "source"

            # Try to extract page number from metadata
            page = d.metadata.get("page", d.metadata.get("page_number"))
            title = f"{base} p.{page}" if page is not None else base

            # Build URL with page reference if applicable
            file_url = _file_to_url(src)
            if page is not None:
                file_url += f"#page={page}"

            citations.append({
                "title": title,
                "url": file_url
            })

        # Load system instructions from prompt.txt — edit via dashboard, takes effect on next query
        _prompt_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prompt.txt')
        try:
            with open(_prompt_file, 'r', encoding='utf-8') as _pf:
                _instructions = _pf.read().strip()
        except FileNotFoundError:
            _instructions = "You are a helpful assistant that answers questions based only on the provided context."

        prompt = f"""{_instructions}

    Question:
    {query}

    Context:
    {context}

    Answer (use [n]-style citations inline where relevant):
    """

        # Invoke the LLM
        resp = self.llm.invoke(prompt)
        text = resp.content if hasattr(resp, "content") else str(resp)

        # --- Detect incomplete numbered list ---
        if re.search(r"(?m)^\d+\.", text):
            numbers = [int(n) for n in re.findall(r"(?m)^(\d+)\.", text)]
            item_count = len(numbers)
            unique_count = len(set(numbers))
            expected_count = re.search(r"\b(\d{1,2})\b.*(truth|commandment|beatitude|article|tenet)", query, re.I)

            if expected_count and unique_count < int(expected_count.group(1)):
                print(f"⚙️ Detected incomplete or partial list ({unique_count}/{expected_count.group(1)}). Retrying...")
                normalized_text = "list may not be complete"
        
        # --- Auto-retry if the AI says it does not have enough information ---
        refusal_phrases = [
            "sorry, we do not have enough information",
            "insufficient context",
            "not enough information",
            "cannot answer",
            "no relevant information",
            "list may not be complete",              
            "appears to be truncated",               
            "context does not include all items",
        ]

        # normalize text early
        normalized_text = text.lower().strip()
        if any(p in normalized_text for p in refusal_phrases):
            print("⚙️ Detected incomplete answer. Running second retrieval pass...")

            seen_keys = {(d.metadata.get("source"), d.metadata.get("page")) for d in ctx_docs}
            added_docs = []
            all_attempted = list(ctx_docs)

            # up to 2 retry passes
            for pass_i in range(2):
                new_docs = self.retrieve(query, k=k * (pass_i + 2))
                unique_new = []
                for d in new_docs:
                    key = (d.metadata.get("source"), d.metadata.get("page"))
                    if key not in seen_keys:
                        seen_keys.add(key)
                        unique_new.append(d)
                if not unique_new:
                    break  # no new context found
                all_attempted.extend(unique_new)
                added_docs.extend(unique_new)

                # stop early if we have new pages or longer context
                if len(all_attempted) >= len(ctx_docs) + 2:
                    break

            if added_docs:
                ctx_docs = all_attempted
                # rebuild the context string
                context_retry = "\n\n".join(
                    f"[{i+1}] {d.page_content.strip()}" for i, d in enumerate(ctx_docs)
                )

                # log retry details
                with open("context.txt", "a", encoding="utf-8") as f:
                    f.write("\n⚙️ Second retrieval pass triggered due to incomplete response.\n")
                    f.write(f"Added {len(added_docs)} new docs.\n")
                    for d in added_docs:
                        f.write(f"  - {d.metadata.get('source')} p.{d.metadata.get('page')}\n")
                    f.write("📄 Expanded Context Sent to Model:\n")
                    f.write(context_retry)
                    f.write("\n" + "=" * 80 + "\n\n")

                # rebuild the prompt with the expanded context
                retry_prompt = f"""{prompt}

        Additional context (second retrieval pass):
        {context_retry}
        """

                try:
                    resp_retry = self.llm.invoke(retry_prompt)
                    text = resp_retry.content if hasattr(resp_retry, "content") else str(resp_retry)
                    print("✅ Second pass complete.")
                except Exception as e:
                    print(f"⚠️ Retry model call failed: {e}")


        
        # Extract which sources were actually cited in the text
        used_indices = {int(n) for n in re.findall(r"\[(\d+)\]", text)}
        if used_indices:
            citations = [c for i, c in enumerate(citations, start=1) if i in used_indices]
            # remove duplicates and keep only valid indices
            citations = citations[:len(used_indices)]
        else:
            # model gave no [n], but we still have retrieved docs — keep first few
            citations = citations[:min(len(ctx_docs), k)]


        
        # Debug: print the response text to inspect it
        # print("AI Response:", text)
        
        # --- Ensure citation numbering matches actual available sources ---
        found_indices = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text)})

        # --- Deduplicate and renumber citations cleanly ---
        if citations:
            # 1) Deduplicate citations (by title+url)
            unique_citations = []
            seen_keys = set()
            for c in citations:
                key = (c["title"], c["url"])
                if key not in seen_keys:
                    seen_keys.add(key)
                    unique_citations.append(c)
            citations = unique_citations

            # 2) Extract unique [n] markers from text
            found_indices = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text)})

            # 3) Rebuild mapping 1→N based on available citations
            max_n = min(len(found_indices), len(citations))
            mapping = {old: new for new, old in enumerate(found_indices[:max_n], start=1)}

            def _renumber_final(match):
                old = int(match.group(1))
                return f"[{mapping.get(old, len(mapping))}]"

            # 4) Apply clean numbering
            text = re.sub(r"\[(\d+)\]", _renumber_final, text)

            # 5) Collapse duplicate inline markers like [5][5][5]
            text = re.sub(r"(\[\d+\])(?:\1)+", r"\1", text)

            # 6) Trim citation list to match remapped range
            citations = citations[: len(mapping)]

        # detect refusal phrases
        refusal_detected = any(
            phrase in normalized_text
            for phrase in [
                "cannot answer",
                "insufficient context",
                "not enough information",
                "no relevant information",
                "based on the provided context i cannot",
                "sorry, we do not have enough information",
                "my main purpose here is to answer information questions from the file base",
            ]
        )

        # detect factual content or citation markers
        has_citations = bool(re.search(r"\[\d+\]", text))
        has_factual_phrases = bool(re.search(r"(\bthe\b|\d+\.|•|- )", text, flags=re.I))

        # 🧠 enhanced logic
        # hide citations if the answer is purely a refusal, even if it includes stray [1]
        if refusal_detected and not has_factual_phrases:
            # Remove stray inline [n]
            text = re.sub(r"\[\d+\]", "", text)
            citations = []

        # If model did not include any [n], auto-append citations at the end of relevant sentences
        if not re.search(r"\[\d+\]", text) and citations:
            # Split text into sentences
            sentences = re.split(r'(?<=[.!?])\s+', text.strip())

            # Attach citations evenly across sentences that seem factual (non-apology)
            factual_sentences = [s for s in sentences if not re.search(r"sorry|cannot|insufficient|not enough", s, re.I)]

            for i, s in enumerate(factual_sentences):
                idx = i % len(citations)  # cycle through citations if fewer than sentences
                sentences[sentences.index(s)] = s.strip() + f" [{idx+1}]"

            text = " ".join(sentences)

        print("⚙️  Retrieved docs:", len(ctx_docs), "| Citations prepared:", len(citations))
        print("⚙️  Found inline markers:", re.findall(r"\[\d+\]", text))

        return text, citations



def _file_to_url(src: str) -> str:
    """
    Converts a local file path to a fully qualified /api/files URL.
    Keeps #page fragments intact so browsers open directly to that page.
    """
    base = os.path.basename(src)
    safe_base = quote(base, safe="#?()[]!$&',;=:@")  # allow useful URL chars
    # api_base = os.getenv("API_BASE", "http://localhost:8000").rstrip("/")
    api_base = os.getenv("API_BASE", "https://api.chat.pathway.training").rstrip("/")
    return f"{api_base}/api/files/{safe_base}"
