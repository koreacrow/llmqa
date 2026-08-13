import { useState } from 'react'

export type Options = {
  spelling: boolean
  tone: boolean
  length: boolean
  duplicate_check: boolean
  world_setting: boolean
  quest_logic: boolean
  npc_voice: boolean
  balance_info: boolean
  ui_guidance: boolean
  qa_repro: boolean
  localization: boolean
  accessibility: boolean
}

type OptionLabel = { key: keyof Options; title: string; note: string }
type Props = { options: Options; onChange: (key: keyof Options) => void }

const coreLabels: OptionLabel[] = [
  { key: 'spelling', title: '용어 · 규칙 일관성', note: '프로젝트 용어를 확인해요' },
  { key: 'tone', title: '콘텐츠 톤앤매너', note: '캐릭터와 문서의 말투를 살펴봐요' },
  { key: 'length', title: '명세 명확성', note: '길고 모호한 문장을 찾아요' },
  { key: 'duplicate_check', title: '중복 콘텐츠', note: '반복되는 내용을 확인해요' },
]

const detailLabels: OptionLabel[] = [
  { key: 'world_setting', title: '세계관 · 설정 충돌', note: '인물·지역·고유명사를 점검해요' },
  { key: 'quest_logic', title: '퀘스트 논리', note: '조건과 보상 누락을 확인해요' },
  { key: 'npc_voice', title: 'NPC 캐릭터성', note: '말투와 관계성의 일치를 살펴봐요' },
  { key: 'balance_info', title: '밸런스 정보', note: '수치와 획득 조건을 확인해요' },
  { key: 'ui_guidance', title: 'UI · 안내 문구', note: '플레이어 행동이 명확한지 봐요' },
  { key: 'qa_repro', title: 'QA 재현성', note: '재현 절차와 결과를 점검해요' },
  { key: 'localization', title: '로컬라이징 준비', note: '번역과 변수 표기를 살펴봐요' },
  { key: 'accessibility', title: '접근성 · 표현 점검', note: '오해 소지가 있는 표현을 확인해요' },
]

function Toggle({ item, options, onChange }: { item: OptionLabel; options: Options; onChange: Props['onChange'] }) {
  return <label className="toggle-row">
    <span><strong>{item.title}</strong><small>{item.note}</small></span>
    <input type="checkbox" checked={options[item.key]} onChange={() => onChange(item.key)} />
    <i aria-hidden="true" />
  </label>
}

export default function ReviewOptions({ options, onChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  return <section className="option-panel" aria-labelledby="option-title">
    <div className="option-intro"><p className="eyebrow">AI 검토 기준</p><h2 id="option-title">프로젝트에 맞는 항목을 선택하세요</h2><p>기본 기준부터 문서 유형별 세부 기준까지 필요한 항목만 선택할 수 있어요.</p></div>
    <div className="option-controls">
      <div className="option-list">{coreLabels.map(item => <Toggle item={item} options={options} onChange={onChange} key={item.key} />)}</div>
      {expanded && <div className="detail-options" aria-label="상세 AI 검토 기준">{detailLabels.map(item => <Toggle item={item} options={options} onChange={onChange} key={item.key} />)}</div>}
      <button className="more-options" type="button" onClick={() => setExpanded(current => !current)} aria-expanded={expanded}>
        {expanded ? '상세 검토 기준 접기 ↑' : '상세 검토 기준 더 보기 ↓'}
      </button>
    </div>
  </section>
}
