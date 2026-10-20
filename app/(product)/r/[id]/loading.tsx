import { AppNav } from "@/components/app/app-nav";

/** Skeleton in the report's own shape: cover, meta row, section nav, findings, concept tabs. */
export default function Loading() {
  return (
    <>
      <AppNav />
      <div aria-busy="true" aria-label="Loading report">
        <div className="report-cover skel" />
        <div className="m-container">
          <div className="report-meta">
            <div className="skel" style={{ height: 30, width: "min(460px, 80%)" }} />
            <div className="skel" style={{ height: 39, width: 220, borderRadius: 999 }} />
          </div>
          <div className="skel" style={{ height: 50, borderRadius: 999 }} />
          <div className="r-section">
            <div className="skel" style={{ height: 44, width: "min(420px, 80%)" }} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel" style={{ height: 22, width: `${92 - i * 9}%`, marginTop: 26 }} />
            ))}
          </div>
          <div className="r-section">
            <div className="concept-tablist">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel" style={{ height: 76, borderRadius: 14 }} />
              ))}
            </div>
            <div className="skel" style={{ height: 420, marginTop: 14, borderRadius: 20 }} />
          </div>
        </div>
      </div>
    </>
  );
}
