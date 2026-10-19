const items = [
  { label: "Music", icon: NoteIcon },
  { label: "Film", icon: FilmIcon },
  { label: "TV", icon: TvIcon },
  { label: "Podcasts", icon: MicIcon },
  { label: "Books", icon: BookIcon },
  { label: "Brands", icon: TagIcon },
  { label: "Places", icon: PinIcon },
] as const;

export function ProofStrip() {
  return (
    <section className="proof" aria-label="Categories Sondo researches">
      <div className="m-container">
        <div className="proof-row">
          <span>What Sondo asks Qloo about.</span>
          <div className="proof-items">
            {items.map(({ label, icon: Icon }) => (
              <span key={label}>
                <Icon />
                {label}
              </span>
            ))}
            <i className="proof-sep" aria-hidden="true" />
            <strong>Powered by Qloo</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 12.5V3.5l7-1.5v9" />
      <circle cx="4.5" cy="12.5" r="1.7" />
      <circle cx="11.5" cy="11" r="1.7" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.2" />
      <path d="M5 3v10M11 3v10M2 6.2h3M2 9.8h3M11 6.2h3M11 9.8h3" />
    </svg>
  );
}

function TvIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="8" rx="1.2" />
      <path d="M6 13.5h4M8 11v2.5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2.5M6 13.5h4" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 2.5h4.2c.7.8 1.6 1.2 2.8 1.2H13V13H8.8c-.8 0-1.6.3-2.3.8H3z" />
      <path d="M8 3.7v10" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8.2 8 2.7h5.2V8L7.8 13.4z" />
      <circle cx="11" cy="5.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14s4.5-4 4.5-7.2A4.5 4.5 0 0 0 3.5 6.8C3.5 10 8 14 8 14z" />
      <circle cx="8" cy="6.7" r="1.3" />
    </svg>
  );
}
