import os, uuid, glob, html
from typing import List, Tuple, Optional, Dict
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
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "600"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
TOP_K = int(os.getenv("TOP_K", "4"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()

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
        new_docs = self.retrieve(query, k=k * 2)

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
def _load_docs_from_dir(path: str) -> List[Document]:
    docs: List[Document] = []
    # load .md / .txt
    for fp in glob.glob(os.path.join(path, "**", "*.md"), recursive=True) + \
               glob.glob(os.path.join(path, "**", "*.txt"), recursive=True):
        loader = TextLoader(fp, encoding="utf-8")
        for d in loader.load():
            d.metadata["source"] = fp
            docs.append(d)
    # load .html
    for fp in glob.glob(os.path.join(path, "**", "*.html"), recursive=True):
        loader = BSHTMLLoader(fp, open_encoding="utf-8")
        for d in loader.load():
            d.metadata["source"] = fp
            docs.append(d)
    # load .pdf
    for fp in glob.glob(os.path.join(path, "**", "*.pdf"), recursive=True):
        try:
            loader = PyPDFLoader(fp)
            for d in loader.load():
                d.metadata["source"] = fp
                docs.append(d)
        except Exception:
            # skip unreadable pdfs; consider logging
            continue
    return docs

def _split(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    return splitter.split_documents(docs)

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
        # (re)create index if missing; otherwise open persisted
        embeddings = _build_embeddings()

        if not os.path.exists(CHROMA_DIR) or not os.listdir(CHROMA_DIR):
            os.makedirs(CHROMA_DIR, exist_ok=True)
            base_docs = _load_docs_from_dir(DOCS_DIR)
            chunks = _split(base_docs)
            vectordb = Chroma.from_documents(
                documents=chunks,
                embedding=embeddings,
                persist_directory=CHROMA_DIR,
                collection_name="site-docs",
            )
        else:
            vectordb = Chroma(
                embedding_function=embeddings,
                persist_directory=CHROMA_DIR,
                collection_name="site-docs",
            )
        llm = _build_llm()
        return cls(llm=llm, vectordb=vectordb)

    def reload(self):
        # drop + rebuild (simple approach)
        try:
            self.vectordb.delete_collection()
        except Exception:
            pass
        embeddings = _build_embeddings()
        os.makedirs(CHROMA_DIR, exist_ok=True)
        base_docs = _load_docs_from_dir(DOCS_DIR)
        chunks = _split(base_docs)
        self.vectordb = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=CHROMA_DIR,
            collection_name="site-docs",
        )

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
        ctx_docs = self.retrieve(query, k=k)
        ctx_docs = self._expand_adjacent_pages(ctx_docs, window=2)
        # Optional minor quality filter to drop obviously irrelevant junk
        ctx_docs = [d for d in ctx_docs if len(d.page_content.split()) > 10]
        if not ctx_docs:
            ctx_docs = self.retrieve(query, k=k)  # retry without the soft filter if emptied
        
        # Build the numbered context block that the LLM will cite as [n]
        context = "\n\n".join(
            f"[{i+1}] {d.page_content.strip()}" for i, d in enumerate(ctx_docs)
        )

        # --- Save context to local file ---
        try:
            with open("context.txt", "a", encoding="utf-8") as f:
                f.write("=" * 80 + "\n")
                f.write(f"🧠 Query: {query}\n")
                f.write("-" * 80 + "\n")
                f.write("📄 Context Sent to Model:\n")
                f.write(context)
                f.write("\n" + "=" * 80 + "\n\n")
        except Exception as e:
            print(f"⚠️ Failed to write context.txt: {e}")


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

        # Clean, explicit prompt to avoid hallucination
        prompt = f"""You are a concise assistant that must answer using ONLY the provided context.

You may reason from context clues to interpret abbreviations, acronyms, or partial terms if their likely meaning can be clearly inferred from the text provided. 
For example, if a repeated acronym appears near specific phrases, titles, or descriptions that indicate what it likely refers to, you may use that inferred meaning. 
However, never use outside knowledge or external assumptions that are not supported by the context itself.

Rules:
- Ensure that the citation numbering you use ([1], [2], etc.) directly corresponds to the sources list that will be provided below.
- If the context is insufficient, say so briefly including the phrase "sorry, we do not have enough information" and do not invent details.
- If a meaning cannot be reasonably inferred, explicitly state that it is unclear.
- If the question is not really a question, and it is a simple conversational input, feel free to respond with a conversational response and inform that your main purpose here is to answer information questions from the file base. 
- When you do inform the users your main purpose and you are not responding with any of the information you got from the context. 
- Encourage the user to ask you questions that is within the realm of your purpose and direct or redirect the conversation toward that, especially when you can't answer
- When you do not have the answers to a question, respond with "sorry, we do not have enough information" and then invite the user to ask questions related to the topics found in the file base or the materials you have access to. Do not invent new topics or domains that are not supported by the context. Make sure you give examples of what topics are in the file base. Do not just tell the user to ask questions related to the topics found in the file base
- If you are responding with infromation fom the context, you do not need to explain your purpose to the user
- You may mention general topic categories only if they clearly appear in the retrieved context. For example, if many documents reference education or ministry, you may encourage questions in those areas. Otherwise, simply invite the user to ask another question without naming new topics.
- if you are listing things, feel free to include \n at the end of each of the list items. so that it can be displayed to the user better visually
- Only cite a source [n] if the text of that source directly contains the information you are presenting.
- Do not assign citation numbers evenly or by count.
- If the question or statement includes any form of curse words, gently tell the user to stop.
- Refrain from using any form of contraction (for example, use "do not" instead of "don't", use "cannot" instead of "can't").
- Note: The context may include only part of a numbered or sequential list.
- If consecutive numbers or headings appear, continue listing them only if their full text is visible in the context.
- Do not invent missing items beyond what is present.

    Question:
    {query}

    Context:
    {context}

    Answer (use [n]-style citations inline where relevant):
    """

        # Invoke the LLM
        resp = self.llm.invoke(prompt)
        text = resp.content if hasattr(resp, "content") else str(resp)
        
        # --- Auto-retry if the AI says it does not have enough information ---
        refusal_phrases = [
            "sorry, we do not have enough information",
            "insufficient context",
            "not enough information",
            "cannot answer",
            "no relevant information",
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


        
        # 🧠 NEW: hide citations if AI says it cannot answer
        normalized = text.lower().strip()

        # detect refusal phrases
        refusal_detected = any(
            phrase in normalized
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
    api_base = os.getenv("API_BASE", "http://localhost:8000").rstrip("/")
    return f"{api_base}/api/files/{safe_base}"