import { useState, useEffect } from "react";
import { getHealth, getTeam, getStop, getStops } from "./api";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [stops, setStops] = useState([]);
  const [selectedStop, setSelectedStop] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [team, setTeam] = useState(null);
  const stopId = path.match(/^\/stops\/(\d+)\/?$/)?.[1];

  function navigate(nextPath, restoreScroll = false) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    if (restoreScroll) {
      const savedScroll = Number(sessionStorage.getItem("stops-scroll-y") || 0);
      requestAnimationFrame(() => window.scrollTo(0, savedScroll));
    }
  }

  function openStop(id) {
    sessionStorage.setItem("stops-scroll-y", String(window.scrollY));
    navigate(`/stops/${id}`);
  }

  async function loadStops() {
    try {
      const data = await getStops();
      setStops(data);
    } catch (e) {
      console.error("Nepodařilo se načíst zastávky:", e);
    }
  }

  useEffect(() => {
    if (stopId) {
      getStop(stopId)
        .then(setSelectedStop)
        .catch((error) => console.error("Nepodařilo se načíst detail zastávky:", error));
    } else {
      loadStops();
    }
    getHealth()
      .then((data) => setHealthStatus(data.status))
      .catch((error) => console.error("Failed to load health status:", error));
    getTeam()
      .then(setTeam)
      .catch((error) => console.error("Failed to load team:", error));
  }, [stopId]);

  const isDetail = Boolean(stopId);

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
            <h1>{isDetail ? "Detail zastávky" : "Zastávky"}</h1>
            <p className="hero-copy">{isDetail ? "Vybavení, přístupnost a poloha vybrané zastávky." : "Přehled všech zastávek, jejich vybavení a přístupnosti na jednom místě."}</p>
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
              <h2>{isDetail ? selectedStop?.name || "Načítání" : "Seznam zastávek"}</h2>
            </div>
            {healthStatus === "ok" && <span className="health-label">Stav API: OK</span>}
          </div>
          {isDetail && selectedStop ? (
            <article className="stop-detail">
              <img className="stop-detail-image" src={selectedStop.image_url} alt={`Zastávka ${selectedStop.name}`} />
              <div className="stop-detail-content">
                <button className="back-button" onClick={() => navigate("/stops", true)}>← Zpět na seznam</button>
                <p className="eyebrow">Zastávka #{selectedStop.id}</p>
                <h3>{selectedStop.name}</h3>
                <dl className="stop-facts">
                  <div><dt>Bezbariérový přístup</dt><dd>{selectedStop.wheelchair_accessible ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Přístřešek</dt><dd>{selectedStop.has_shelter ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Lavička</dt><dd>{selectedStop.has_bench ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Automat na jízdenky</dt><dd>{selectedStop.has_ticket_machine ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Informační displej</dt><dd>{selectedStop.has_display ? "Ano" : "Ne"}</dd></div>
                </dl>
              </div>
            </article>
          ) : !isDetail && stops.length === 0 ? (
            <div className="empty-state">
              <strong>Zatím tu nejsou žádné zastávky</strong>
              <span>Seznam zastávek je momentálně prázdný.</span>
            </div>
          ) : !isDetail ? (
            <div className="stops-grid">
              {stops.map((stop) => (
                <article className="stop-card" key={stop.id} onClick={() => openStop(stop.id)}>
                  <img className="stop-image" src={stop.image_url} alt={`Zastávka ${stop.name}`} />
                  <div className="stop-card-heading">
                    <span className="stop-id">#{stop.id}</span>
                  </div>
                  <h3>{stop.name}</h3>
                  <p>{stop.wheelchair_accessible ? "Bezbariérový přístup" : "Přístupnost neuvedena"}</p>
                  <span className="stop-open">Zobrazit detail →</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Zastávku se nepodařilo najít</strong>
              <button className="back-button" onClick={() => navigate("/stops", true)}>Zpět na seznam zastávek</button>
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
