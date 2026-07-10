import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ============================================================
   TORRE DI CONTROLLO — Orologi Calamai
   Versione Vercel. Novità: lista competitor personalizzabile
   nella sezione Ispo (persistita su KV insieme al resto).
   ============================================================ */

const T = {
  cream: "#f4f1ea",
  paper: "#ece8de",
  ink: "#1a1c20",
  inkSoft: "#3a3d44",
  line: "#d8d2c4",
  red: "#C93741",
  green: "#3f7d4e",
  amber: "#b8862d",
  grey: "#8a8578",
};

const STAKEHOLDER_DEFS = [
  { id: "media", label: "Media & Stampa", desc: "Riviste, blog orologieri, giornalisti", halfLifeDays: 30 },
  { id: "community", label: "Community & Forum", desc: "Reddit, WatchUSeek, gruppi FB, watchfam", halfLifeDays: 14 },
  { id: "clienti", label: "Clienti & Newsletter", desc: "Acquirenti, lista email, conto visione", halfLifeDays: 21 },
  { id: "social", label: "Social Audience", desc: "Instagram, YouTube, follower", halfLifeDays: 7 },
  { id: "rivenditori", label: "Rivenditori & B2B", desc: "Gioiellerie, concept store, partner", halfLifeDays: 45 },
  { id: "influencer", label: "Influencer & Reviewer", desc: "Micro-influencer, YouTuber verticali", halfLifeDays: 30 },
  { id: "istituzioni", label: "Territorio & Fiere", desc: "Fiesole, artigianato toscano, Homo Faber", halfLifeDays: 60 },
];

const KPI_DEFS = [
  { id: "ig_followers", label: "Instagram — Follower", group: "Instagram" },
  { id: "ig_engagement", label: "Instagram — Engagement %", group: "Instagram" },
  { id: "gsc_clicks", label: "Search Console — Click (28gg)", group: "Sito" },
  { id: "gsc_impressions", label: "Search Console — Impression (28gg)", group: "Sito" },
  { id: "newsletter", label: "Iscritti newsletter", group: "Email" },
  { id: "visioni", label: "Richieste conto visione/mese", group: "Vendite" },
];

const DEFAULT_COMPETITORS = ["Unimatic", "Furlan Marri", "Venezianico", "Baltic"];

const BRAND_CONTEXT = `Orologi Calamai è un microbrand artigianale di orologi con sede a Fiesole (Toscana). Casse ricavate da acciaio di turbine aeronautiche militari (F-104 Starfighter, Panavia Tornado). Tre generazioni di tradizione familiare. Tagline: "Dal cielo al polso". Modelli: G50 Freccia (varianti blu, stone, marrone), MKIV (bianco, nero). Vendita diretta con "conto visione" gratuito. Fondatore e voce del brand: Francesco Calamai. Fase attuale: lancio comunicazione, notorietà molto bassa, budget contenuto.`;

const uid = () => Math.random().toString(36).slice(2, 10);
const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

function heat(activity, halfLife) {
  const d = daysAgo(activity.date);
  return (activity.importance || 3) * Math.pow(0.5, d / halfLife);
}
function categoryHeat(acts, halfLife) {
  return acts.reduce((s, a) => s + heat(a, halfLife), 0);
}
function heatStatus(h) {
  if (h >= 3) return { label: "CALDO", color: T.green };
  if (h >= 1.2) return { label: "TIEPIDO", color: T.amber };
  return { label: "FREDDO", color: T.red };
}

/* ---------- API client ---------- */
const getKey = () => localStorage.getItem("dash-key") || "";

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-dashboard-key": getKey(),
      ...(opts.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("AUTH");
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function callClaude(prompt, useSearch = false, maxTokens = 1500) {
  const j = await api("/api/claude", {
    method: "POST",
    body: JSON.stringify({ prompt, useSearch, maxTokens }),
  });
  return j.text;
}

function extractJSON(txt) {
  const clean = txt.replace(/```json|```/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Risposta senza JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

/* ============================================================ */

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [pwd, setPwd] = useState("");
  const [authError, setAuthError] = useState("");

  const [activities, setActivities] = useState({});
  const [kpis, setKpis] = useState([]);
  const [competitors, setCompetitors] = useState(DEFAULT_COMPETITORS);
  const [tab, setTab] = useState("radar");
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [ispo, setIspo] = useState(null);
  const [ispoLoading, setIspoLoading] = useState(false);
  const [addFor, setAddFor] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", date: new Date().toISOString().slice(0, 10) });
  const [kpiForm, setKpiForm] = useState({ id: "ig_followers", value: "", date: new Date().toISOString().slice(0, 10) });
  const [newCompetitor, setNewCompetitor] = useState("");
  const [ideaBrief, setIdeaBrief] = useState("");
  const [moreIdeasLoading, setMoreIdeasLoading] = useState(false);
  const [moreIdeasError, setMoreIdeasError] = useState("");

  /* ---------- auth + load ---------- */
  const loadData = useCallback(async () => {
    const d = await api("/api/data");
    setActivities(d.activities || {});
    setKpis(d.kpis || []);
    setPlan(d.plan || null);
    setIspo(d.ispo || null);
    setCompetitors(Array.isArray(d.competitors) && d.competitors.length ? d.competitors : DEFAULT_COMPETITORS);
  }, []);

  useEffect(() => {
    (async () => {
      if (getKey()) {
        try {
          await loadData();
          setAuthed(true);
        } catch (e) {
          localStorage.removeItem("dash-key");
        }
      }
      setAuthChecking(false);
    })();
  }, [loadData]);

  const login = async () => {
    setAuthError("");
    localStorage.setItem("dash-key", pwd);
    try {
      await loadData();
      setAuthed(true);
    } catch (e) {
      localStorage.removeItem("dash-key");
      setAuthError(e.message === "AUTH" ? "Password errata." : `Errore: ${e.message}`);
    }
  };

  const saveAll = useCallback(async (a, k, p, i, c) => {
    try {
      await api("/api/data", {
        method: "POST",
        body: JSON.stringify({ activities: a, kpis: k, plan: p, ispo: i, competitors: c }),
      });
    } catch (e) {
      console.error("save", e);
    }
  }, []);

  /* ---------- competitor list ---------- */
  const addCompetitor = () => {
    const name = newCompetitor.trim();
    if (!name || competitors.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    const next = [...competitors, name];
    setCompetitors(next);
    saveAll(activities, kpis, plan, ispo, next);
    setNewCompetitor("");
  };
  const removeCompetitor = (name) => {
    const next = competitors.filter((c) => c !== name);
    setCompetitors(next);
    saveAll(activities, kpis, plan, ispo, next);
  };

  /* ---------- attività ---------- */
  const addActivity = async () => {
    if (!form.title.trim() || !addFor) return;
    setEvaluating(true);
    let importance = 3,
      rationale = "";
    try {
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nSei il PR director del brand. Valuta il peso di questa attività di comunicazione verso lo stakeholder "${STAKEHOLDER_DEFS.find((s) => s.id === addFor)?.label}":\nTitolo: ${form.title}\nNote: ${form.notes || "—"}\n\nUsa TUTTA la scala 1-5, distinguendo con decisione. Ancore di riferimento:\n5 = evento raro e ad alto impatto (uscita su testata nazionale/internazionale importante, premio, AMA su Reddit riuscito, accordo con rivenditore prestigioso, servizio TV)\n4 = attività significativa non quotidiana (articolo su blog di settore rilevante, collaborazione con micro-influencer verticale, newsletter con lancio, presenza a fiera)\n3 = attività di mantenimento con valore (articolo sul proprio blog, video YouTube, partecipazione attiva a discussione di forum)\n2 = attività ordinaria a basso impatto (post Instagram standard, storia, commento su forum)\n1 = attività minima (repost, like ricevuto, menzione di passaggio, storia effimera)\nSii severo: un post social ordinario NON merita più di 2. Un'uscita stampa su testata minore vale 3-4, su testata maggiore 5.\n\nRispondi SOLO con JSON puro, senza backtick né testo extra:\n{"importance": <1-5>, "rationale": "<max 15 parole in italiano che giustificano il peso>"}`,
        false,
        400
      );
      const j = extractJSON(txt);
      importance = Math.min(5, Math.max(1, j.importance));
      rationale = j.rationale || "";
    } catch (e) {
      rationale = "Valutazione automatica non disponibile — peso standard.";
    }

    const act = { id: uid(), title: form.title.trim(), notes: form.notes.trim(), date: form.date, importance, rationale };
    const next = { ...activities, [addFor]: [act, ...(activities[addFor] || [])] };
    setActivities(next);
    saveAll(next, kpis, plan, ispo, competitors);
    setForm({ title: "", notes: "", date: new Date().toISOString().slice(0, 10) });
    setAddFor(null);
    setEvaluating(false);
  };

  const removeActivity = (catId, actId) => {
    const next = { ...activities, [catId]: (activities[catId] || []).filter((a) => a.id !== actId) };
    setActivities(next);
    saveAll(next, kpis, plan, ispo, competitors);
  };

  /* ---------- piano di volo ---------- */
  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const snapshot = STAKEHOLDER_DEFS.map((s) => {
        const acts = activities[s.id] || [];
        const h = categoryHeat(acts, s.halfLifeDays);
        const recent = acts.slice(0, 4).map((a) => `- ${a.date}: ${a.title} (imp ${a.importance})`).join("\n") || "- nessuna attività registrata";
        return `## ${s.label} (calore attuale: ${h.toFixed(1)}, half-life ${s.halfLifeDays}gg)\n${recent}`;
      }).join("\n\n");
      const kpiTxt = kpis.slice(-12).map((k) => `${k.date} ${KPI_DEFS.find((d) => d.id === k.id)?.label}: ${k.value}`).join("\n") || "nessun KPI registrato";

      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nOggi è ${new Date().toISOString().slice(0, 10)}. Sei un PR manager con 20 anni di esperienza nel lusso artigianale.\n\nStato attività per stakeholder:\n${snapshot}\n\nKPI recenti:\n${kpiTxt}\n\nPer OGNI categoria di stakeholder, proponi LA prossima azione concreta e QUANDO farla. Priorità alle categorie più fredde. Rispondi SOLO con JSON puro:\n{"items":[{"category":"<id tra: ${STAKEHOLDER_DEFS.map((s) => s.id).join(", ")}>","action":"<azione concreta, max 20 parole>","when":"<es. entro 7 giorni / settimana del 20 lug>","priority":<1-3, 1=urgente>}]}`,
        false,
        1800
      );
      const j = extractJSON(txt);
      const p = { generatedAt: new Date().toISOString(), items: j.items || [] };
      setPlan(p);
      saveAll(activities, kpis, p, ispo, competitors);
    } catch (e) {
      setPlan({ generatedAt: new Date().toISOString(), items: [], error: `Generazione non riuscita (${e.message}). Riprova.` });
    }
    setPlanLoading(false);
  };

  /* ---------- Ispo: ricerca competitor con web search reale ---------- */
  const generateIspo = async () => {
    if (!competitors.length) {
      setIspo({ generatedAt: new Date().toISOString(), observations: [], ideas: [], error: "Aggiungi almeno un competitor da analizzare." });
      return;
    }
    setIspoLoading(true);
    try {
      const done =
        Object.entries(activities)
          .flatMap(([cat, acts]) => acts.slice(0, 5).map((a) => `[${cat}] ${a.title}`))
          .join("\n") || "nessuna attività registrata";

      const list = competitors.join(", ");

      /* FASE 1 — ricerca web in prosa sui competitor scelti dall'utente */
      const research = await callClaude(
        `Cerca sul web le attività di comunicazione RECENTI di questi brand orologieri: ${list}. Per ciascun brand cerca: campagne social, uscite stampa, collaborazioni, lanci di prodotto, iniziative di marketing. Per OGNI attività trovata riporta anche: QUANDO è stata lanciata (data o periodo, il più preciso possibile dalle fonti), se è ancora in corso, e se ha una durata definita o stimabile (es. edizione limitata fino a esaurimento, campagna stagionale, collaborazione one-shot, serie continuativa). Riassumi in italiano, brand per brand, con il maggior dettaglio possibile su ogni attività. Se per un brand non trovi nulla di recente, dillo esplicitamente.`,
        true,
        3000
      );
      if (!research || research.trim().length < 50) throw new Error("ricerca vuota");

      /* FASE 2 — strutturazione JSON con timeline e piani di attuazione */
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nAttività di comunicazione già svolte da Calamai:\n${done}\n\nRisultati di una ricerca di mercato sui competitor selezionati (${list}):\n${research}\n\nProduci: (1) osservazioni dettagliate per OGNI attività trovata di ogni competitor — una scheda per attività, non una per brand — con timeline e durata; (2) 4-6 idee di comunicazione per Calamai ispirate a ciò che funziona, adattate al suo posizionamento (acciaio da turbine militari, artigianato toscano, conto visione), evitando di ripetere attività già svolte, ciascuna con un principio di piano di attuazione in 3-5 passi concreti. Rispondi SOLO con JSON puro, senza backtick né testo extra:\n{"observations":[{"who":"<brand>","what":"<titolo attività, max 12 parole>","detail":"<descrizione dettagliata dell'attività, meccanica e obiettivo, max 50 parole>","when":"<quando è stata lanciata, es. 'marzo 2026' o 'non determinabile'>","duration":"<durata o stato, es. 'in corso', 'edizione limitata', 'one-shot', 'campagna 6 settimane', 'non determinabile'>"}],"ideas":[{"title":"<idea, max 10 parole>","detail":"<come applicarla a Calamai, max 40 parole>","effort":"<basso|medio|alto>","plan":["<passo 1>","<passo 2>","<passo 3>"]}]}\nSe una data o durata non emerge dalle fonti, scrivi "non determinabile" — non inventare.`,
        false,
        3000
      );
      const j = extractJSON(txt);
      const i = { generatedAt: new Date().toISOString(), liveSearch: true, analyzed: [...competitors], ...j };
      setIspo(i);
      saveAll(activities, kpis, plan, i, competitors);
    } catch (e) {
      setIspo({ generatedAt: new Date().toISOString(), observations: [], ideas: [], error: `Ricerca non riuscita (${e.message}). Riprova tra qualche istante.` });
    }
    setIspoLoading(false);
  };

  /* ---------- Ispo: nuove idee da brief ---------- */
  const generateMoreIdeas = async () => {
    setMoreIdeasError("");
    setMoreIdeasLoading(true);
    try {
      const done =
        Object.entries(activities)
          .flatMap(([cat, acts]) => acts.slice(0, 5).map((a) => `[${cat}] ${a.title}`))
          .join("\n") || "nessuna attività registrata";
      const existing = (ispo?.ideas || []).map((i) => `- ${i.title}`).join("\n") || "nessuna";
      const marketNotes = (ispo?.observations || [])
        .map((o) => `- ${o.who}: ${o.what}${o.when ? ` (${o.when})` : ""}`)
        .join("\n") || "nessuna scansione recente";

      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nAttività già svolte da Calamai:\n${done}\n\nIdee già proposte in precedenza (NON ripeterle):\n${existing}\n\nOsservazioni recenti sul mercato:\n${marketNotes}\n\nBrief del PR manager per questa generazione: "${ideaBrief.trim() || "idee libere, purché coerenti col brand"}"\n\nGenera 3-5 NUOVE idee di comunicazione per Calamai che rispondano al brief, ciascuna con un principio di piano di attuazione in 3-5 passi concreti. Rispondi SOLO con JSON puro, senza backtick né testo extra:\n{"ideas":[{"title":"<idea, max 10 parole>","detail":"<come applicarla a Calamai, max 40 parole>","effort":"<basso|medio|alto>","plan":["<passo 1>","<passo 2>","<passo 3>"]}]}`,
        false,
        2000
      );
      const j = extractJSON(txt);
      const newIdeas = (j.ideas || []).map((i) => ({ ...i, fromBrief: ideaBrief.trim() || null }));
      const nextIspo = {
        ...(ispo || { observations: [], generatedAt: new Date().toISOString() }),
        ideas: [...(ispo?.ideas || []), ...newIdeas],
      };
      setIspo(nextIspo);
      saveAll(activities, kpis, plan, nextIspo, competitors);
      setIdeaBrief("");
    } catch (e) {
      setMoreIdeasError(`Generazione non riuscita (${e.message}). Riprova.`);
    }
    setMoreIdeasLoading(false);
  };

  /* ---------- KPI ---------- */
  const addKpi = () => {
    if (!kpiForm.value) return;
    const next = [...kpis, { ...kpiForm, value: parseFloat(kpiForm.value), ts: Date.now() }];
    setKpis(next);
    saveAll(activities, next, plan, ispo, competitors);
    setKpiForm({ ...kpiForm, value: "" });
  };

  const kpiLatest = useMemo(() => {
    const m = {};
    KPI_DEFS.forEach((d) => {
      const hist = kpis.filter((k) => k.id === d.id).sort((a, b) => a.ts - b.ts);
      if (hist.length >= 1) {
        m[d.id] = { ...hist[hist.length - 1], prev: hist.length >= 2 ? hist[hist.length - 2].value : null };
      }
    });
    return m;
  }, [kpis]);

  /* ---------- styles ---------- */
  const S = {
    app: { minHeight: "100vh", background: T.cream, color: T.ink, fontFamily: "'Inter', system-ui, sans-serif" },
    mono: { fontFamily: "'Space Grotesk', 'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.12em" },
    serif: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 600 },
    card: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 4 },
    btn: { background: T.ink, color: T.cream, border: "none", padding: "10px 18px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 11, borderRadius: 3 },
    btnRed: { background: T.red },
    input: { width: "100%", padding: "9px 10px", border: `1px solid ${T.line}`, borderRadius: 3, fontSize: 13, background: T.cream, color: T.ink, boxSizing: "border-box" },
    chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 20, padding: "5px 12px", fontSize: 12 },
  };

  /* ---------- login screen ---------- */
  if (authChecking) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={S.mono}>Caricamento…</span>
      </div>
    );
  }
  if (!authed) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ ...S.card, padding: 32, width: 340, textAlign: "center" }}>
          <div style={{ ...S.mono, fontSize: 10, color: T.red }}>Orologi Calamai</div>
          <h1 style={{ ...S.serif, fontSize: 24, margin: "6px 0 20px" }}>Torre di Controllo</h1>
          <input
            style={S.input}
            type="password"
            placeholder="Password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            autoFocus
          />
          {authError && <div style={{ color: T.red, fontSize: 12, marginTop: 8 }}>{authError}</div>}
          <button style={{ ...S.btn, ...S.btnRed, width: "100%", marginTop: 12 }} onClick={login}>
            Accedi
          </button>
        </div>
      </div>
    );
  }

  const Gauge = ({ h }) => {
    const pct = Math.min(1, h / 5);
    const angle = -90 + pct * 180;
    const st = heatStatus(h);
    return (
      <svg width="72" height="44" viewBox="0 0 72 44" aria-hidden="true">
        <path d="M6 40 A30 30 0 0 1 66 40" fill="none" stroke={T.line} strokeWidth="5" />
        <path d="M6 40 A30 30 0 0 1 66 40" fill="none" stroke={st.color} strokeWidth="5" strokeDasharray={`${pct * 94.2} 94.2`} strokeLinecap="round" />
        <line x1="36" y1="40" x2={36 + 24 * Math.sin((angle * Math.PI) / 180)} y2={40 - 24 * Math.cos((angle * Math.PI) / 180)} stroke={T.ink} strokeWidth="2" strokeLinecap="round" />
        <circle cx="36" cy="40" r="3" fill={T.ink} />
      </svg>
    );
  };

  return (
    <div style={S.app}>
      <header style={{ borderBottom: `1px solid ${T.line}`, padding: "20px 24px", display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ ...S.mono, fontSize: 10, color: T.red }}>Orologi Calamai — Ufficio Comunicazione</div>
          <h1 style={{ ...S.serif, margin: "4px 0 0", fontSize: 26 }}>Torre di Controllo</h1>
        </div>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[
            ["radar", "Radar"],
            ["piano", "Piano di volo"],
            ["ispo", "Ispo"],
            ["kpi", "Strumenti"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{ ...S.btn, background: tab === id ? T.red : "transparent", color: tab === id ? T.cream : T.ink, border: `1px solid ${tab === id ? T.red : T.line}` }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {/* ============ RADAR ============ */}
        {tab === "radar" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {STAKEHOLDER_DEFS.map((s) => {
              const acts = activities[s.id] || [];
              const h = categoryHeat(acts, s.halfLifeDays);
              const st = heatStatus(h);
              return (
                <div key={s.id} style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: T.grey, marginTop: 2 }}>{s.desc}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <Gauge h={h} />
                      <div style={{ ...S.mono, fontSize: 9, color: st.color, fontWeight: 700 }}>{st.label}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, flex: 1 }}>
                    {acts.length === 0 && <div style={{ fontSize: 12, color: T.grey, fontStyle: "italic" }}>Nessuna attività registrata. Questa categoria è scoperta.</div>}
                    {acts.slice(0, 4).map((a) => {
                      const ah = heat(a, s.halfLifeDays);
                      return (
                        <div key={a.id} style={{ borderTop: `1px solid ${T.line}`, padding: "7px 0", fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontWeight: 500 }}>{a.title}</span>
                            <button onClick={() => removeActivity(s.id, a.id)} title="Elimina" style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 12, padding: 0 }}>
                              ×
                            </button>
                          </div>
                          <div style={{ color: T.grey, fontSize: 10, marginTop: 2 }}>
                            {a.date} · peso {a.importance}/5 · calore residuo {ah.toFixed(1)}
                            {a.rationale ? ` · ${a.rationale}` : ""}
                          </div>
                        </div>
                      );
                    })}
                    {acts.length > 4 && <div style={{ fontSize: 10, color: T.grey, marginTop: 4 }}>+{acts.length - 4} precedenti</div>}
                  </div>

                  {addFor === s.id ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                      <input style={S.input} placeholder="Cosa è stato fatto? (es. Pitch inviato a Worn & Wound)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                      <input style={S.input} placeholder="Note (opzionale)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                      <input style={S.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...S.btn, ...S.btnRed, flex: 1 }} onClick={addActivity} disabled={evaluating}>
                          {evaluating ? "Valutazione…" : "Registra"}
                        </button>
                        <button style={{ ...S.btn, background: "transparent", color: T.ink, border: `1px solid ${T.line}` }} onClick={() => setAddFor(null)}>
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...S.btn, marginTop: 10, background: "transparent", color: T.ink, border: `1px dashed ${T.grey}` }} onClick={() => setAddFor(s.id)}>
                      + Aggiungi attività
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============ PIANO ============ */}
        {tab === "piano" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={{ ...S.serif, margin: 0 }}>Piano di volo</h2>
                <p style={{ fontSize: 12, color: T.grey, margin: "4px 0 0" }}>Prossime azioni per categoria, in base al calore attuale e alla storia delle attività.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={generatePlan} disabled={planLoading}>
                {planLoading ? "Analisi in corso…" : "Genera proiezione"}
              </button>
            </div>
            {plan?.error && <p style={{ color: T.red, fontSize: 13 }}>{plan.error}</p>}
            {plan?.items?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 8 }}>Generato: {new Date(plan.generatedAt).toLocaleString("it-IT")}</div>
                {[1, 2, 3].map((p) => {
                  const items = plan.items.filter((i) => i.priority === p);
                  if (!items.length) return null;
                  const plabel = p === 1 ? "Priorità alta" : p === 2 ? "Priorità media" : "In seguito";
                  const pcolor = p === 1 ? T.red : p === 2 ? T.amber : T.grey;
                  return (
                    <div key={p} style={{ marginBottom: 20 }}>
                      <div style={{ ...S.mono, fontSize: 11, color: pcolor, fontWeight: 700, marginBottom: 8 }}>{plabel}</div>
                      {items.map((it, i) => (
                        <div key={i} style={{ ...S.card, padding: "12px 16px", marginBottom: 8, borderLeft: `3px solid ${pcolor}`, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ ...S.mono, fontSize: 9, color: T.grey }}>{STAKEHOLDER_DEFS.find((s) => s.id === it.category)?.label || it.category}</div>
                            <div style={{ fontSize: 14, marginTop: 3 }}>{it.action}</div>
                          </div>
                          <div style={{ ...S.mono, fontSize: 10, color: T.inkSoft, alignSelf: "center", whiteSpace: "nowrap" }}>{it.when}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {!plan && !planLoading && <p style={{ fontSize: 13, color: T.grey, marginTop: 20 }}>Registra qualche attività nel Radar, poi genera la prima proiezione.</p>}
          </div>
        )}

        {/* ============ ISPO ============ */}
        {tab === "ispo" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={{ ...S.serif, margin: 0 }}>Ispo</h2>
                <p style={{ fontSize: 12, color: T.grey, margin: "4px 0 0" }}>Ricerca web live sui competitor che scegli tu, con idee adattate a Calamai.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={generateIspo} disabled={ispoLoading}>
                {ispoLoading ? "Ricerca web in corso…" : "Scansiona competitor"}
              </button>
            </div>

            {/* lista competitor gestibile */}
            <div style={{ ...S.card, padding: 14, marginTop: 14 }}>
              <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>Competitor da analizzare</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {competitors.map((c) => (
                  <span key={c} style={S.chip}>
                    {c}
                    <button onClick={() => removeCompetitor(c)} title="Rimuovi" style={{ background: "none", border: "none", cursor: "pointer", color: T.red, fontSize: 14, padding: 0, lineHeight: 1 }}>
                      ×
                    </button>
                  </span>
                ))}
                {competitors.length === 0 && <span style={{ fontSize: 12, color: T.grey, fontStyle: "italic" }}>Nessun competitor in lista.</span>}
              </div>
              <div style={{ display: "flex", gap: 6, maxWidth: 420 }}>
                <input
                  style={S.input}
                  placeholder="Aggiungi brand (es. Serica, Ollech & Wajs…)"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                />
                <button style={S.btn} onClick={addCompetitor}>
                  +
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.grey, marginTop: 8 }}>
                Consiglio: 3-6 brand per scansione. La ricerca web fa fino a 5 ricerche per giro — con liste lunghe l'analisi diventa più superficiale.
              </div>
            </div>

            {ispo?.error && <p style={{ color: T.red, fontSize: 13 }}>{ispo.error}</p>}
            {ispo?.observations?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 8 }}>
                  Scansione: {new Date(ispo.generatedAt).toLocaleString("it-IT")}
                  <span style={{ color: T.green }}> · ricerca web live</span>
                  {ispo.analyzed && <span> · brand: {ispo.analyzed.join(", ")}</span>}
                </div>
                <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Osservato sul mercato</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                  {ispo.observations.map((o, i) => (
                    <div key={i} style={{ ...S.card, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ ...S.mono, fontSize: 10, color: T.red }}>{o.who}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{o.what}</div>
                      {o.detail && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>{o.detail}</div>}
                      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        {o.when && (
                          <span style={{ ...S.mono, fontSize: 9, color: T.grey }}>
                            ⏱ lancio: <span style={{ color: T.ink }}>{o.when}</span>
                          </span>
                        )}
                        {o.duration && (
                          <span style={{ ...S.mono, fontSize: 9, color: T.grey }}>
                            durata: <span style={{ color: T.ink }}>{o.duration}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* idee: visibili anche senza observations (es. generate solo da brief) */}
            {ispo?.ideas?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Idee per Calamai</div>
                {ispo.ideas.map((idea, i) => (
                  <div key={i} style={{ ...S.card, padding: "12px 16px", marginBottom: 8, borderLeft: `3px solid ${T.ink}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{idea.title}</span>
                      <span style={{ ...S.mono, fontSize: 9, color: idea.effort === "basso" ? T.green : idea.effort === "alto" ? T.red : T.amber }}>sforzo {idea.effort}</span>
                    </div>
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4 }}>{idea.detail}</div>
                    {idea.fromBrief && <div style={{ fontSize: 10, color: T.grey, marginTop: 4, fontStyle: "italic" }}>da brief: “{idea.fromBrief}”</div>}
                    {Array.isArray(idea.plan) && idea.plan.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ ...S.mono, fontSize: 10, color: T.red, cursor: "pointer" }}>Piano di attuazione</summary>
                        <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: T.inkSoft }}>
                          {idea.plan.map((step, si) => (
                            <li key={si} style={{ marginBottom: 4 }}>{step}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* generatore di nuove idee da brief */}
            <div style={{ ...S.card, padding: 14, marginTop: 20 }}>
              <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>Genera nuove idee</div>
              <textarea
                style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Brief per l'LLM (es. 'idee low budget per il periodo natalizio', 'qualcosa che coinvolga la community dei piloti', 'attività per spingere il conto visione'). Vuoto = idee libere."
                value={ideaBrief}
                onChange={(e) => setIdeaBrief(e.target.value)}
              />
              {moreIdeasError && <div style={{ color: T.red, fontSize: 12, marginTop: 6 }}>{moreIdeasError}</div>}
              <button style={{ ...S.btn, ...S.btnRed, marginTop: 8 }} onClick={generateMoreIdeas} disabled={moreIdeasLoading}>
                {moreIdeasLoading ? "Generazione…" : "Genera altre idee"}
              </button>
              <div style={{ fontSize: 10, color: T.grey, marginTop: 6 }}>Le nuove idee si aggiungono all'elenco sopra, senza ripetere quelle esistenti. Tiene conto delle attività già svolte e dell'ultima scansione competitor.</div>
            </div>

            {!ispo && !ispoLoading && <p style={{ fontSize: 13, color: T.grey, marginTop: 20 }}>Componi la lista e avvia la prima scansione — oppure genera idee direttamente da un brief.</p>}
          </div>
        )}

        {/* ============ KPI ============ */}
        {tab === "kpi" && (
          <div>
            <h2 style={{ ...S.serif, margin: 0 }}>Strumenti di bordo</h2>
            <p style={{ fontSize: 12, color: T.grey, margin: "4px 0 16px" }}>
              I KPI arrivano automaticamente dai workflow N8N (GSC, Instagram) via webhook. L'inserimento manuale qui sotto resta disponibile come integrazione o correzione.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
              {KPI_DEFS.map((d) => {
                const latest = kpiLatest[d.id];
                const delta = latest?.prev != null ? latest.value - latest.prev : null;
                return (
                  <div key={d.id} style={{ ...S.card, padding: 14 }}>
                    <div style={{ ...S.mono, fontSize: 9, color: T.grey }}>{d.group}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "'Fraunces', Georgia, serif", marginTop: 6 }}>{latest ? latest.value.toLocaleString("it-IT") : "—"}</div>
                    {delta != null && (
                      <div style={{ fontSize: 11, color: delta >= 0 ? T.green : T.red, fontWeight: 600 }}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString("it-IT")} vs rilevazione precedente
                      </div>
                    )}
                    {latest && <div style={{ fontSize: 10, color: T.grey, marginTop: 2 }}>al {latest.date}</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ ...S.card, padding: 16, maxWidth: 480 }}>
              <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Nuova rilevazione manuale</div>
              <div style={{ display: "grid", gap: 8 }}>
                <select style={S.input} value={kpiForm.id} onChange={(e) => setKpiForm({ ...kpiForm, id: e.target.value })}>
                  {KPI_DEFS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <input style={S.input} type="number" placeholder="Valore" value={kpiForm.value} onChange={(e) => setKpiForm({ ...kpiForm, value: e.target.value })} />
                <input style={S.input} type="date" value={kpiForm.date} onChange={(e) => setKpiForm({ ...kpiForm, date: e.target.value })} />
                <button style={{ ...S.btn, ...S.btnRed }} onClick={addKpi}>
                  Registra rilevazione
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: `1px solid ${T.line}`, padding: "14px 24px", ...S.mono, fontSize: 9, color: T.grey, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span>Dal cielo al polso</span>
        <button
          onClick={() => {
            localStorage.removeItem("dash-key");
            window.location.reload();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, ...S.mono, fontSize: 9, padding: 0 }}
        >
          Esci
        </button>
      </footer>
    </div>
  );
}
