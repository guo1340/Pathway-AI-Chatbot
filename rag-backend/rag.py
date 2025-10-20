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
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
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
        retriever = self.vectordb.as_retriever(search_kwargs={"k": k})
        return retriever.invoke(query)

    # rag.py (drop-in replacement for answer() only; rest unchanged)

    def answer(self, query: str, k: int = TOP_K) -> Tuple[str, List[Dict[str, str]]]:
        ctx_docs = self.retrieve(query, k=k)

        # Build the numbered context block that the LLM will cite as [n]
        context = "\n\n".join(
            f"[{i+1}] {d.page_content.strip()}" for i, d in enumerate(ctx_docs)
        )

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
    - Cite sources with the exact bracket numbers like [1], [2] corresponding to the context.
    - If the context is insufficient, say so briefly including the phrase "we do not have enough information" and do not invent details.

    Question:
    {query}

    Context:
    {context}

    Answer (use [n]-style citations inline where relevant):
    """

        # Invoke the LLM
        resp = self.llm.invoke(prompt)
        text = resp.content if hasattr(resp, "content") else str(resp)
        
        # Extract which sources were actually cited in the text
        used_indices = {int(n) for n in re.findall(r"\[(\d+)\]", text)}
        if used_indices:
            citations = [c for i, c in enumerate(citations, start=1) if i in used_indices]
        
        # Debug: print the response text to inspect it
        # print("AI Response:", text)
        
        # 🧠 NEW: hide citations if AI says it cannot answer
        normalized = text.lower().strip()
        if any(
            phrase in normalized
            for phrase in [
                "cannot answer",
                "cannot answer from the given context",
                "insufficient context",
                "not enough information",
                "no relevant information",
                "based on the provided context i cannot",
                "we do not have enough information",
            ]
        ):
            # print("Refusal detected! Clearing citations.")
            citations = []

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