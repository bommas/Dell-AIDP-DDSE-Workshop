export type SearchTab = "all" | "ai";

type Props = {
  active: SearchTab;
  onChange: (tab: SearchTab) => void;
};

export function SearchTabs({ active, onChange }: Props) {
  return (
    <nav className="gs-tabs" aria-label="Search modes">
      <button
        type="button"
        className={active === "all" ? "gs-tab active" : "gs-tab"}
        onClick={() => onChange("all")}
      >
        All
      </button>
      <button
        type="button"
        className={active === "ai" ? "gs-tab active" : "gs-tab"}
        onClick={() => onChange("ai")}
      >
        AI Mode
      </button>
    </nav>
  );
}
