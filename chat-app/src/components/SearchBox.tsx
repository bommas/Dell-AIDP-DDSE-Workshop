import { useEffect, useState, type FormEvent } from "react";

type Props = {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function SearchBox({ value, placeholder, autoFocus, onChange, onSubmit }: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = local.trim();
    if (!q) return;
    onSubmit(q);
  }

  return (
    <form className="gs-search" onSubmit={handleSubmit} role="search">
      <span className="gs-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        value={local}
        autoFocus={autoFocus}
        placeholder={placeholder || "Search providers, specialties, cities…"}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange(e.target.value);
        }}
        aria-label="Search"
      />
      <button type="submit" className="gs-search-btn">
        Search
      </button>
    </form>
  );
}
