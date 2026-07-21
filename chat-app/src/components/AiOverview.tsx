type Props = {
  query: string;
  answer: string | null;
  loading: boolean;
  error: string | null;
};

export function AiOverview({ query, answer, loading, error }: Props) {
  return (
    <section className="gs-ai" aria-label="AI Mode answer">
      <header className="gs-ai-header">
        <span className="gs-ai-badge">AI Mode</span>
        <p className="gs-ai-query">About “{query}”</p>
      </header>

      {loading && (
        <div className="gs-ai-body thinking-block">
          <span />
          <span />
          <span />
        </div>
      )}

      {!loading && error && <p className="banner err">{error}</p>}

      {!loading && !error && answer && <div className="gs-ai-body">{answer}</div>}

      {!loading && !error && !answer && (
        <p className="gs-ai-body muted">Ask a question to get an agent answer.</p>
      )}
    </section>
  );
}
