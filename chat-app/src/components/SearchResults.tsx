import type { SearchHit } from "../lib/a2a";

type Props = {
  query: string;
  total: number;
  took?: number;
  hits: SearchHit[];
  loading: boolean;
};

function stripEm(html: string): string {
  return html.replace(/<\/?em>/gi, "");
}

export function SearchResults({ query, total, took, hits, loading }: Props) {
  if (loading && hits.length === 0) {
    return (
      <div className="gs-results">
        <p className="gs-stats">Searching…</p>
        <div className="gs-skeleton" />
        <div className="gs-skeleton" />
        <div className="gs-skeleton" />
      </div>
    );
  }

  if (!loading && hits.length === 0) {
    return (
      <div className="gs-results">
        <p className="gs-stats">
          No results for <strong>{query}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="gs-results">
      <p className="gs-stats">
        About {total.toLocaleString()} results{took != null ? ` (${took} ms)` : ""}
      </p>
      <ul className="gs-result-list">
        {hits.map((hit) => {
          const place = [hit.city, hit.state].filter(Boolean).join(", ");
          const meta = [hit.specialty, place].filter(Boolean).join(" · ");
          const ratings = [
            hit.rating != null ? `Overall ${hit.rating}` : null,
            hit.patientRating != null ? `Patient ${hit.patientRating}` : null,
            hit.distanceKm != null ? `${hit.distanceKm} km away` : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={hit.id} className="gs-result">
              <p className="gs-result-path">
                {hit.index} › {hit.id}
                {hit.telephone ? ` · ${hit.telephone}` : ""}
              </p>
              <h3 className="gs-result-title">{hit.title}</h3>
              {meta && <p className="gs-result-meta">{meta}</p>}
              <p className="gs-result-snippet">{stripEm(hit.snippet)}</p>
              {ratings && <p className="gs-result-ratings">{ratings}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
