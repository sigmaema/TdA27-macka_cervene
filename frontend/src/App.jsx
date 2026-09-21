import { useState, useEffect } from "react";
import { getHealth, getTeam, getStops } from "./api";

export default function App() {
  const [stops, setStops] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const [team, setTeam] = useState(null);

  async function loadStops() {
    try {
      const data = await getStops();
      setStops(data);
    } catch (e) {
      console.error("Nepodařilo se načíst zastávky:", e);
    }
  }

  useEffect(() => {
    loadStops();
    getHealth()
      .then((data) => setHealthStatus(data.status))
      .catch((error) => console.error("Failed to load health status:", error));
    getTeam()
      .then(setTeam)
      .catch((error) => console.error("Failed to load team:", error));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <img className="brand-logo" src="/brand/logo.svg" alt="Think different Academy" />
        <div className="status-pill">
          <span className={`status-dot ${healthStatus === "ok" ? "is-online" : ""}`} />
          {healthStatus === "ok" ? "Systém online" : "Připojování"}
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Mapa města</p>
            <h1>Zastávky</h1>
            <p className="hero-copy">Přehled zastávek, jejich vybavení a přístupnosti na jednom místě.</p>
          </div>
          {team && (
            <aside className="team-signature">
              <span className="signature-label">Built by</span>
              <strong>{team.name}</strong>
              <span>{team.members.join(" · ")}</span>
            </aside>
          )}
        </section>

        <section className="workspace" aria-label="Správa zastávek">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Databáze</p>
              <h2>Zastávky</h2>
            </div>
            {healthStatus === "ok" && <span className="health-label">Stav API: OK</span>}
          </div>
          {stops.length === 0 ? (
            <div className="empty-state">
              <strong>Zatím tu nejsou žádné zastávky</strong>
            </div>
          ) : (
            <div className="stops-grid">
              {stops.map((stop) => (
                <article className="stop-card" key={stop.id}>
                  <div className="stop-card-heading">
                    <span className="stop-id">#{stop.id}</span>
                    {stop.is_transfer && <span className="stop-badge">Přestupní</span>}
                  </div>
                  <h3>{stop.name}</h3>
                  <p>{stop.wheelchair_accessible ? "Bezbariérový přístup" : "Přístupnost neuvedena"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="page-footer">
        <span>Think different Academy</span>
        <span>Správa zastávek</span>
      </footer>
    </div>
  );
}
