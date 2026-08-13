type Feedback = { title: string; detail: string; example: string; type: string; priority: '필수' | '권장' }
type Props = { feedback: Feedback[]; hasReviewed: boolean; documentTypeLabel: string }
export default function AnalysisPanel({ feedback, hasReviewed, documentTypeLabel }: Props) {
  const requiredCount = feedback.filter(item => item.priority === '필수').length
  const recommendedCount = feedback.filter(item => item.priority === '권장').length
  const status = !hasReviewed ? '검수 대기 중이에요' : requiredCount ? '필수 보완 항목이 있어요' : feedback.length ? '권장 보완 항목이 있어요' : '선택한 문서 기준을 충족했어요'
  return <aside className="analysis-panel" aria-label="AI 검토 결과">
    <section className="score-card">
      <div><p className="eyebrow">보완 · AI 검토 피드백</p><strong>{status}</strong><p className="score-note">현재 <b>{documentTypeLabel}</b> 기준으로 필수 정보와 선택한 검토 항목을 확인해요.</p></div>
      {hasReviewed && <span className="feedback-summary">필수 {requiredCount}건<br />권장 {recommendedCount}건</span>}
    </section>
    <section className="result-section">
      <div className="section-heading"><h2>문서 보완 항목</h2><span>{hasReviewed ? `필수 ${requiredCount} · 전체 ${feedback.length}` : '검수 전'}</span></div>
      {!hasReviewed ? <div className="empty-result">왼쪽에서 문서 유형과 초안을 선택한 뒤<br /><b>AI 검수하기</b>를 눌러 보완 항목을 확인해 주세요.</div>
        : feedback.length ? <div className="bubble-list">{feedback.map((item, index) => <article className="feedback-bubble" key={`${item.type}-${index}`}><div className="feedback-meta"><b>{item.priority}</b><i>{item.type}</i></div><strong>{item.title}</strong><span>{item.detail}</span><div className="feedback-example"><b>수정 예시</b><p>{item.example}</p></div></article>)}</div>
          : <div className="empty-result"><b>{documentTypeLabel}</b>에 필요한 핵심 정보가 확인됐어요.<br />현재 선택한 검토 기준을 모두 충족했어요.</div>}
    </section>
  </aside>
}
