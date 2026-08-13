import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import ReviewOptions, { Options } from './components/ReviewOptions'
import AnalysisPanel from './components/AnalysisPanel'
const initialOptions: Options = {
  spelling: true, tone: true, length: false, duplicate_check: true,
  world_setting: false, quest_logic: false, npc_voice: false, balance_info: false,
  ui_guidance: false, qa_repro: false, localization: false, accessibility: false,
}
type DocumentType = 'planning' | 'npc' | 'quest' | 'bug'
type Feedback = { title: string; detail: string; example: string; type: string; priority: '필수' | '권장' }
const documentTypes: { value: DocumentType; label: string; note: string }[] = [
  { value: 'planning', label: '기획서 초안', note: '기능·콘텐츠의 목표와 흐름을 정리해요' },
  { value: 'npc', label: 'NPC 대사 초안', note: '인물의 말투와 대화 목적을 다듬어요' },
  { value: 'quest', label: '퀘스트 초안', note: '조건·목표·보상을 설계해요' },
  { value: 'bug', label: '버그 리포트 초안', note: '오류 재현과 결과를 기록해요' },
]
const fieldExamples: Record<DocumentType, { purpose: string; audience: string; structure: string; text: string }> = {
  planning: {
    purpose: '예: 신규 기능의 필요성과 범위를 팀에 공유하기 위해 작성합니다.',
    audience: '예: 게임 기획자 · 클라이언트 개발자 · UI/UX 디자이너',
    structure: '예: 문제 배경 → 기획 목표 → 핵심 기능 → 플레이어 흐름 → MVP 범위',
    text: '예: 신규 유저는 첫 퀘스트의 목표를 놓치기 쉽습니다. 유적 진입 시 목표 UI를 표시하고 NPC가 다음 행동을 안내합니다.',
  },
  npc: {
    purpose: '예: 신규 NPC의 말투와 대사 가이드를 정리해 로컬라이징 팀과 공유합니다.',
    audience: '예: 내러티브 기획자 · 퀘스트 기획자 · 로컬라이징 담당자',
    structure: '예: NPC 역할 → 대화 상황 → 말투 기준 → 핵심 대사 → 플레이어 안내',
    text: '예: 숲의 수호자 리아는 차분하고 신비로운 말투로 플레이어를 “여행자”라고 부르며, 달빛 파편 3개를 찾도록 안내합니다.',
  },
  quest: {
    purpose: '예: 신규 유저가 첫 퀘스트 흐름을 쉽게 이해하도록 설계합니다.',
    audience: '예: 퀘스트 기획자 · 클라이언트 개발자 · QA 담당자',
    structure: '예: 시작 조건 → 퀘스트 목표 → 진행 단계 → 완료 조건 → 보상 → 예외 상황',
    text: '예: 시작: 고대 유적 진입 후 리아와 대화 / 목표: 달빛 파편 3개 수집 / 완료: 리아에게 전달 / 보상: 회복 물약 2개와 경험치 500',
  },
  bug: {
    purpose: '예: 재현 가능한 버그 리포트를 작성해 개발팀에 전달합니다.',
    audience: '예: QA 담당자 · 클라이언트 개발자 · 프로젝트 매니저',
    structure: '예: 발생 환경 → 재현 절차 → 예상 결과 → 실제 결과 → 발생 빈도·심각도',
    text: '예: 환경: v1.2.0 Android / 재현: 1) 유적 입장 2) 리아와 대화 3) 파편 3개 수집 / 예상: 보상 지급 / 실제: 보상 미지급',
  },
}
export default function App() {
  const [documentType, setDocumentType] = useState<DocumentType>('quest')
  const [purpose, setPurpose] = useState('')
  const [audience, setAudience] = useState('')
  const [structure, setStructure] = useState('')
  const [text, setText] = useState('')
  const [options, setOptions] = useState<Options>(initialOptions)
  const [status, setStatus] = useState('')
  const [hasReviewed, setHasReviewed] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [feedback, setFeedback] = useState<Feedback[]>([])

  useEffect(() => {
    api('settings').then(r => r.ok ? r.json() : Promise.reject()).then(setOptions).catch(() => setStatus('설정을 불러오지 못했어요.'))
  }, [])

  const updateOption = useCallback((key: keyof Options) => {
    const next = { ...options, [key]: !options[key] }
    setOptions(next)
    api('settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      .catch(() => setStatus('설정 저장에 실패했어요.'))
  }, [options])

  const review = async () => {
    if (!text.trim() && !purpose.trim() && !audience.trim() && !structure.trim()) {
      setStatus('검토할 프로젝트 초안을 입력해 주세요.')
      return
    }
    setIsReviewing(true)
    setStatus('AI가 초안을 검토하고 있어요...')
    try {
      const result = await api('review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType, purpose, audience, structure, text, options }),
      })
      if (!result.ok) {
        const err = await result.json().catch(() => null)
        throw new Error(err?.detail || '검토 요청이 실패했어요.')
      }
      const data = await result.json()
      const items: Feedback[] = data.items ?? []
      setFeedback(items)
      setHasReviewed(true)
      setStatus(`AI 검토를 완료했어요. 필수 ${items.filter(item => item.priority === '필수').length}건, 권장 ${items.filter(item => item.priority === '권장').length}건을 확인해 주세요.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'AI 검토 중 오류가 발생했어요. 다시 시도해 주세요.')
    } finally {
      setIsReviewing(false)
    }
  }

  const save = async () => {
    if (!text.trim()) {
      setStatus('검토 기록으로 저장할 섹션 초안을 입력해 주세요.')
      return
    }
    try {
      const result = await api('analyses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, tags: [] }) })
      if (!result.ok) throw new Error()
      setStatus('검토 기록을 저장했어요.')
    } catch {
      setStatus('기록을 저장하지 못했어요. 다시 시도해 주세요.')
    }
  }

  const resetDraft = () => {
    setPurpose('')
    setAudience('')
    setStructure('')
    setText('')
    setHasReviewed(false)
    setFeedback([])
    setStatus('초안을 비웠어요.')
  }

  const selectType = (type: DocumentType) => {
    setDocumentType(type)
    setHasReviewed(false)
  }
  const typeLabel = documentTypes.find(item => item.value === documentType)?.label ?? '문서 초안'
  const fieldExample = fieldExamples[documentType]

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span>✦</span>게임 제작 AI 워크벤치</a>
      <div className="header-action"><span className="saved-status">{status || '프로젝트 설정 자동 저장'}</span><button className="save-button" onClick={save}>검토 기록 저장</button></div>
    </header>
    <main id="top">
      <section className="intro">
        <div><p className="eyebrow">GAME PRODUCTION AI WORKBENCH</p><h1>게임 제작의 반복 업무를 더 빠르게.</h1><p>기획서, NPC 대사, 퀘스트와 버그 리포트를 구조화하고 AI 피드백으로 보완해 보세요.</p></div>
        <div className="count-card"><strong>{text.length}</strong><span>섹션 초안 글자 <i>·</i> 공백 포함</span></div>
      </section>
      <ReviewOptions options={options} onChange={updateOption} />
      <section className="workspace" aria-label="게임 제작 문서 검토 작업 공간">
        <div className="editor-pane">
          <div className="pane-title"><div><p className="eyebrow">프로젝트 초안</p><h2>문서 유형을 고르고 초안을 작성해 보세요</h2></div><button onClick={resetDraft}>지우기</button></div>
          <div className="draft-form">
            <fieldset className="document-type-field"><legend><b>목적</b><small>어떤 초안을 만들까요?</small></legend><div className="document-type-list">{documentTypes.map(item => <button type="button" key={item.value} className={documentType === item.value ? 'document-type active' : 'document-type'} onClick={() => selectType(item.value)} aria-pressed={documentType === item.value}><strong>{item.label}</strong><span>{item.note}</span></button>)}</div></fieldset>
            <label className="draft-field"><span><b>목적</b><small>왜 만드는가?</small></span><input value={purpose} onChange={event => { setPurpose(event.target.value); setHasReviewed(false) }} placeholder={fieldExample.purpose} /></label>
            <label className="draft-field"><span><b>독자</b><small>누가 읽는가?</small></span><input value={audience} onChange={event => { setAudience(event.target.value); setHasReviewed(false) }} placeholder={fieldExample.audience} /></label>
            <label className="draft-field"><span><b>구조</b><small>무슨 순서인가?</small></span><input value={structure} onChange={event => { setStructure(event.target.value); setHasReviewed(false) }} placeholder={fieldExample.structure} /></label>
            <label className="draft-field section-field"><span><b>섹션 초안</b><small>{typeLabel}에 필요한 내용을 작성해 보세요</small></span><textarea value={text} onChange={event => { setText(event.target.value); setHasReviewed(false) }} placeholder={fieldExample.text} aria-label="게임 제작 문서 입력" /></label>
            <div className="review-action"><p>{typeLabel}에 맞는 핵심 항목과 선택한 AI 검토 기준을 확인합니다.</p><button type="button" className="review-button" onClick={review} disabled={isReviewing}>{isReviewing ? 'AI 검수 중...' : 'AI 검수하기'}</button></div>
          </div>
        </div>
        <AnalysisPanel feedback={feedback} hasReviewed={hasReviewed} documentTypeLabel={typeLabel} />
      </section>
    </main>
  </div>
}
