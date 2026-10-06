import { useEffect, useState } from "react";
import { getHealth, getTeam, getLines, getStop, getStops } from "./api";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [stops, setStops] = useState([]);
  const [lines, setLines] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStop, setSelectedStop] = useState(null);
  const [stopError, setStopError] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [team, setTeam] = useState(null);

  const stopId = path.match(/^\/stops\/(\d+)\/?$/)?.[1];
  const isLines = path === "/lines" || path === "/lines/";
  const isDetail = Boolean(stopId);

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

  useEffect(() => {
    if (stopId) {
      setSelectedStop(null);
      setStopError(null);
      getStop(stopId)
        .then(setSelectedStop)
        .catch((error) => {
          console.error("Nepodařilo se načíst detail zastávky:", error);
          setStopError("Zastávku se nepodařilo načíst. Zkontrolujte připojení nebo její ID.");
        });
    } else if (isLines) {
      getLines()
        .then(setLines)
        .catch((error) => console.error("Nepodařilo se načíst linky:", error));
    } else {
      getStops()
        .then(setStops)
        .catch((error) => console.error("Nepodařilo se načíst zastávky:", error));
    }

    getHealth()
      .then((data) => setHealthStatus(data.status))
      .catch((error) => console.error("Nepodařilo se načíst stav API:", error));
    getTeam()
      .then(setTeam)
      .catch((error) => console.error("Nepodařilo se načíst tým:", error));
  }, [stopId, isLines]);

  function normalizeSearchText(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("cs-CZ");
  }

  const normalizedQuery = normalizeSearchText(searchQuery.trim());
  const filteredStops = stops.filter((stop) => {
    if (!normalizedQuery) return true;
    const searchableText = [
      stop.name,
      stop.image_url,
      stop.wheelchair_accessible ? "bezbarierovy pristup ano" : "",
      stop.has_shelter ? "pristresek ano" : "",
      stop.has_ticket_machine ? "automat na jizdenky ano" : "",
    ].join(" ");
    return normalizeSearchText(searchableText).includes(normalizedQuery);
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <img className="brand-logo" src="/brand/logo.svg" alt="Think different Academy" />
        <nav className="main-nav" aria-label="Hlavní navigace">
          <button className={!isLines && !isDetail ? "nav-button is-active" : "nav-button"} onClick={() => navigate("/stops")}>Zastávky</button>
          <button className={isLines ? "nav-button is-active" : "nav-button"} onClick={() => navigate("/lines")}>Linky</button>
        </nav>
        <div className="status-pill">
          <span className={`status-dot ${healthStatus === "ok" ? "is-online" : ""}`} />
          {healthStatus === "ok" ? "Systém online" : "Připojování"}
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Mapa města</p>
            <h1>{isDetail ? "Detail zastávky" : isLines ? "Linky" : "Zastávky"}</h1>
            <p className="hero-copy">
              {isDetail
                ? "Vybavení, přístupnost a poloha vybrané zastávky."
                : isLines
                  ? "Přehled linek dopravního systému a jejich základního značení."
                  : "Přehled všech zastávek, jejich vybavení a přístupnosti na jednom místě."}
            </p>
          </div>
          {team && (
            <aside className="team-signature">
              <span className="signature-label">Built by</span>
              <strong>{team.name}</strong>
              <span>{team.members.join(" · ")}</span>
            </aside>
          )}
        </section>

        <section className="workspace" aria-label={isLines ? "Přehled linek" : "Správa zastávek"}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Databáze</p>
              <h2>{isDetail ? selectedStop?.name || "Načítání" : isLines ? "Všechny linky" : "Seznam zastávek"}</h2>
            </div>
            {healthStatus === "ok" && <span className="health-label">Stav API: OK</span>}
          </div>

          {isLines ? (
            lines.length === 0 ? (
              <div className="empty-state">
                <strong>Zatím tu nejsou žádné linky</strong>
                <span>Seznam linek je momentálně prázdný.</span>
              </div>
            ) : (
              <div className="lines-grid">
                {lines.map((line) => (
                  <article className="line-card" key={line.id}>
                    <div className="line-card-content">
                      <div className="line-title-row">
                        <span className="line-code">{line.code}</span>
                        <span className="line-separator">·</span>
                        <h3 style={{ color: line.color }}>{line.name}</h3>
                      </div>
                      <span className="line-type">{line.type}</span>
                    </div>
                    <span className="line-color" style={{ backgroundColor: line.color }} aria-label={`Barva linky ${line.color}`} />
                  </article>
                ))}
              </div>
            )
          ) : isDetail && stopError ? (
            <div className="empty-state error-state">
              <strong>{stopError}</strong>
              <button className="back-button" onClick={() => navigate("/stops", true)}>Zpět na seznam zastávek</button>
            </div>
          ) : isDetail && !selectedStop ? (
            <div className="empty-state">
              <strong>Načítání detailu zastávky…</strong>
            </div>
          ) : isDetail && selectedStop ? (
            <article className="stop-detail">
              {selectedStop.image_url ? (
                <img className="stop-detail-image" src={selectedStop.image_url} alt={`Zastávka ${selectedStop.name}`} />
              ) : (
                <div className="stop-detail-image image-placeholder">Obrázek není k dispozici</div>
              )}
              <div className="stop-detail-content">
                <button className="back-button" onClick={() => navigate("/stops", true)}>← Zpět na seznam</button>
                <p className="eyebrow">Zastávka #{selectedStop.id}</p>
                <h3>{selectedStop.name}</h3>
                <dl className="stop-facts">
                  <div><dt>Bezbariérový přístup</dt><dd>{selectedStop.wheelchair_accessible ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Přístřešek</dt><dd>{selectedStop.has_shelter ? "Ano" : "Ne"}</dd></div>
                  <div><dt>Automat na jízdenky</dt><dd>{selectedStop.has_ticket_machine ? "Ano" : "Ne"}</dd></div>
                </dl>
              </div>
            </article>
          ) : stops.length === 0 ? (
            <div className="empty-state">
              <strong>Zatím tu nejsou žádné zastávky</strong>
              <span>Seznam zastávek je momentálně prázdný.</span>
            </div>
          ) : filteredStops.length === 0 ? (
            <div className="empty-state">
              <strong>Žádná zastávka neodpovídá hledání</strong>
              <span>Zkuste jiný název nebo vlastnost, případně vyhledávání vymažte.</span>
            </div>
          ) : (
            <>
              <div className="search-controls">
                <label className="search-field">
                  <span>Hledat zastávku nebo vlastnost</span>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setSearchQuery(event.target.value);
                    }}
                    placeholder="Např. přístřešek nebo Turing"
                  />
                </label>
                <button className="search-button" onClick={() => setSearchQuery(searchInput)}>Vyhledat</button>
                {(searchInput || searchQuery) && (
                  <button className="clear-search" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>Vymazat</button>
                )}
              </div>
              <div className="stops-grid">
                {filteredStops.map((stop) => (
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
            </>
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
