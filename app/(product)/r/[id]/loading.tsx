import { AppNav } from "@/components/app/app-nav";

export default function Loading() {
  return (
    <>
      <AppNav />
      <div className="m-container" style={{ padding: "40px 0 80px" }} aria-busy="true" aria-label="Loading report">
        <div className="skel" style={{ height: 14, width: 220 }} />
        <div className="skel" style={{ height: 56, width: "min(520px, 90%)", marginTop: 14 }} />
        <div className="skel" style={{ height: 18, width: "min(640px, 95%)", marginTop: 18 }} />
        <div className="report-grid" style={{ marginTop: 40 }}>
          <div className="skel" style={{ height: 420 }} />
          <div className="skel" style={{ height: 420 }} />
          <div className="skel" style={{ height: 420 }} />
        </div>
      </div>
    </>
  );
}
