import Link from "next/link";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#evidence", label: "Evidence" },
  { href: "#principles", label: "What it is" },
];

export function MarketingHeader() {
  return (
    <div className="sky-nav">
      <Link href="/" className="brand" aria-label="Sondo home">
        <span className="brand-mark" aria-hidden="true" />
        Sondo
      </Link>
      <nav aria-label="Primary">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="sky-logins">
        <Link href="/new" className="btn btn-sm btn-sheet">
          Open Sondo <span className="i i-ne" aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
