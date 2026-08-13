import os
import json
import sqlite3
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from anthropic import AsyncAnthropic

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("DB_PATH", str(BASE_DIR / "data" / "app.db"))
DIST_DIR = BASE_DIR / "dist"
MODEL = "claude-sonnet-4-6"

client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


def get_db():
    db_directory = os.path.dirname(DB_PATH)
    if db_directory:
        os.makedirs(db_directory, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            spelling INTEGER DEFAULT 1, tone INTEGER DEFAULT 1,
            length INTEGER DEFAULT 0, duplicate_check INTEGER DEFAULT 1
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL, tags TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(settings)").fetchall()}
        for column in ("world_setting", "quest_logic", "npc_voice", "balance_info", "ui_guidance", "qa_repro", "localization", "accessibility"):
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE settings ADD COLUMN {column} INTEGER DEFAULT 0")
        conn.execute("INSERT OR IGNORE INTO settings (id) VALUES (1)")


app = FastAPI()
init_db()


class Settings(BaseModel):
    spelling: bool
    tone: bool
    length: bool
    duplicate_check: bool
    world_setting: bool = False
    quest_logic: bool = False
    npc_voice: bool = False
    balance_info: bool = False
    ui_guidance: bool = False
    qa_repro: bool = False
    localization: bool = False
    accessibility: bool = False


class Analysis(BaseModel):
    text: str
    tags: List[str]


# ---- LLM 기반 검수 ----

CRITERIA_LABELS = {
    "spelling": "용어 · 규칙 일관성 — 같은 대상을 가리키는 용어 표기가 문서 전체에서 일치하는지 확인",
    "tone": "콘텐츠 톤앤매너 — 문서/대사의 어조가 목적에 맞고 과도한 강조어가 없는지 확인",
    "length": "명세 명확성 — 문장이 지나치게 길거나 모호해서 조건·동작·결과 구분이 어렵지 않은지 확인",
    "duplicate_check": "중복 콘텐츠 — 같은 내용이 불필요하게 반복되지 않는지 확인",
    "world_setting": "세계관 · 설정 충돌 — 인물, 지역, 고유명사가 기존 설정과 모순되지 않는지 확인",
    "quest_logic": "퀘스트 논리 — 시작 조건, 목표, 완료 조건, 보상 중 빠진 것이 없는지 확인",
    "npc_voice": "NPC 캐릭터성 — 말투와 성격이 캐릭터 설정과 일관되는지 확인",
    "balance_info": "밸런스 정보 — 수치, 확률, 획득 조건이 명확하게 기재되어 있는지 확인",
    "ui_guidance": "UI · 안내 문구 — 플레이어가 무엇을 선택·수행해야 하는지 행동이 명확한지 확인",
    "qa_repro": "QA 재현성 — 재현 절차, 예상 결과, 실제 결과가 분리되어 기술되어 있는지 확인",
    "localization": "로컬라이징 준비 — 번역 시 문제가 될 변수 표기, 문화적 표현이 있는지 확인",
    "accessibility": "접근성 · 표현 점검 — 오해 소지가 있거나 배타적인 표현이 없는지 확인",
}

DOC_TYPE_LABELS = {
    "planning": "기획서 초안",
    "npc": "NPC 대사 초안",
    "quest": "퀘스트 초안",
    "bug": "버그 리포트 초안",
}


class ReviewRequest(BaseModel):
    documentType: str
    purpose: str
    audience: str
    structure: str
    text: str
    options: Settings


class FeedbackItem(BaseModel):
    type: str
    title: str
    detail: str
    example: str
    priority: str  # "필수" | "권장"


class ReviewResponse(BaseModel):
    items: List[FeedbackItem]


def strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
    return raw.strip()


async def call_claude_json(system: str, user_msg: str) -> dict:
    """Claude 호출 + JSON 파싱 실패 시 1회 자기 교정 재시도."""
    messages = [{"role": "user", "content": user_msg}]
    for attempt in range(2):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=1500,
            system=system,
            messages=messages,
        )
        raw_text = "".join(block.text for block in response.content if block.type == "text")
        cleaned = strip_fences(raw_text)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            if attempt == 0:
                messages.append({"role": "assistant", "content": raw_text})
                messages.append({
                    "role": "user",
                    "content": "방금 응답은 유효한 JSON이 아니었습니다. 설명이나 코드펜스 없이 지정된 스키마에 맞는 순수 JSON만 다시 출력하세요.",
                })
                continue
            raise HTTPException(status_code=502, detail="모델 응답을 JSON으로 해석하지 못했습니다.")


@app.post("/api/review", response_model=ReviewResponse)
async def review_document(req: ReviewRequest):
    if not req.text.strip() and not req.purpose.strip() and not req.audience.strip() and not req.structure.strip():
        raise HTTPException(status_code=400, detail="검토할 프로젝트 초안을 입력해 주세요.")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되어 있지 않습니다.")

    options_dict = req.options.model_dump()
    enabled = [CRITERIA_LABELS[key] for key, on in options_dict.items() if on and key in CRITERIA_LABELS]
    doc_label = DOC_TYPE_LABELS.get(req.documentType, "문서 초안")

    system = f"""당신은 게임 제작 문서(기획서/NPC 대사/퀘스트/버그 리포트)를 검토하는 시니어 게임 기획 QA 전문가입니다.
주어진 문서 유형과 활성화된 검토 기준에 따라서만 초안을 검토하고, 아래 JSON 형식으로만 응답하세요. 설명, 마크다운, 코드펜스 없이 순수 JSON만 출력하세요.

{{
  "items": [
    {{"type": "기준 이름", "title": "짧은 제목", "detail": "무엇이 문제이고 왜 문제인지 구체적 설명", "example": "수정 예시 또는 보완 방향을 담은 한두 문장", "priority": "필수 | 권장"}}
  ]
}}

규칙:
- 반드시 아래 나열된 "활성화된 검토 기준"에 해당하는 항목만 지적하세요. 비활성화된 기준은 언급하지 마세요.
- 문서 유형({doc_label})에 필요한 핵심 정보(목적, 독자, 구조, 문서 유형별 필수 요소)가 비어있거나 불충분하면 우선적으로 지적하세요.
- 실제로 개선이 필요한 부분만 지적하고, 문제가 없으면 items를 빈 배열로 응답하세요.
- 같은 문제를 여러 항목으로 중복 지적하지 마세요.
- 반드시 유효한 JSON만 출력하세요."""

    criteria_text = "\n".join(f"- {c}" for c in enabled) if enabled else "(활성화된 세부 기준 없음 — 문서 유형 기준 필수 요소만 확인)"

    user_msg = f"""문서 유형: {doc_label}

목적: {req.purpose or '(입력 없음)'}
독자: {req.audience or '(입력 없음)'}
전달 구조: {req.structure or '(입력 없음)'}

섹션 초안:
{req.text or '(입력 없음)'}

활성화된 검토 기준:
{criteria_text}"""

    result = await call_claude_json(system, user_msg)
    items = result.get("items", [])
    return {"items": items}


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/settings")
def read_settings():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        return {key: bool(row[key]) for key in Settings.model_fields}


@app.put("/api/settings")
def save_settings(data: Settings):
    with get_db() as conn:
        values = data.model_dump()
        columns = ", ".join(f"{key}=?" for key in values)
        conn.execute(f"UPDATE settings SET {columns} WHERE id=1", tuple(values.values()))
    return {"ok": True}


@app.get("/api/analyses")
def read_analyses():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM analyses ORDER BY id DESC LIMIT 8").fetchall()
        return [{"id": row["id"], "text": row["text"], "tags": row["tags"], "created_at": row["created_at"]} for row in rows]


@app.post("/api/analyses")
def save_analysis(data: Analysis):
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="텍스트를 입력해 주세요.")
    with get_db() as conn:
        cursor = conn.execute("INSERT INTO analyses (text, tags) VALUES (?, ?)", (data.text.strip(), ",".join(data.tags)))
        return {"id": cursor.lastrowid, "ok": True}


if (DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    index_file = DIST_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="화면 빌드 파일을 찾을 수 없습니다.")

