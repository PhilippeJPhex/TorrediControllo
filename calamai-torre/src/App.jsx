import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ============================================================
   TORRE DI CONTROLLO — Orologi Calamai — v3
   Novità: memoria storica (scansioni Ispo, piani di volo, idee
   accumulate), Rassegna menzioni, Contatti media (mini-CRM),
   Report mensile generato dall'LLM.
   ============================================================ */

const T = {
  cream: "#f4f1ea", paper: "#ece8de", ink: "#1a1c20", inkSoft: "#3a3d44",
  line: "#d8d2c4", red: "#C93741", green: "#3f7d4e", amber: "#b8862d", grey: "#8a8578",
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
const fmtDT = (iso) => new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

function heat(a, halfLife) { return (a.importance || 3) * Math.pow(0.5, daysAgo(a.date) / halfLife); }
function categoryHeat(acts, hl) { return acts.reduce((s, a) => s + heat(a, hl), 0); }
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
    headers: { "Content-Type": "application/json", "x-dashboard-key": getKey(), ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("AUTH");
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function callClaude(prompt, useSearch = false, maxTokens = 1500) {
  const j = await api("/api/claude", { method: "POST", body: JSON.stringify({ prompt, useSearch, maxTokens }) });
  return j.text;
}

function extractJSON(txt) {
  const clean = txt.replace(/```json|```/g, "");
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("Risposta senza JSON");
  return JSON.parse(clean.slice(s, e + 1));
}

const EMPTY_DATA = { activities: {}, kpis: [], competitors: DEFAULT_COMPETITORS, ispoScans: [], ideas: [], plans: [], mentions: [], contacts: [], reports: [] };

/* ============================================================ */

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [pwd, setPwd] = useState("");
  const [authError, setAuthError] = useState("");

  const [data, setData] = useState(EMPTY_DATA);
  const [tab, setTab] = useState("radar");

  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [ispoLoading, setIspoLoading] = useState(false);
  const [ispoError, setIspoError] = useState("");
  const [addFor, setAddFor] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", date: new Date().toISOString().slice(0, 10) });
  const [kpiForm, setKpiForm] = useState({ id: "ig_followers", value: "", date: new Date().toISOString().slice(0, 10) });
  const [newCompetitor, setNewCompetitor] = useState("");
  const [ideaBrief, setIdeaBrief] = useState("");
  const [moreIdeasLoading, setMoreIdeasLoading] = useState(false);
  const [moreIdeasError, setMoreIdeasError] = useState("");

  // Rassegna
  const [mentionForm, setMentionForm] = useState({ title: "", url: "", source: "", date: new Date().toISOString().slice(0, 10) });
  const [classifying, setClassifying] = useState(false);

  // Contatti
  const [contactForm, setContactForm] = useState({ name: "", outlet: "", email: "", beat: "" });
  const [showContactForm, setShowContactForm] = useState(false);
  const [interactionFor, setInteractionFor] = useState(null);
  const [interactionText, setInteractionText] = useState("");
  const [pitchLoading, setPitchLoading] = useState(null);

  // Report
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  /* ---------- load con migrazione dai formati precedenti ---------- */
  const loadData = useCallback(async () => {
    const d = await api("/api/data");
    const next = { ...EMPTY_DATA, ...d };
    // migrazione v1/v2 → v3
    if (d.plan && !Array.isArray(d.plans)) next.plans = d.plan.items?.length ? [{ id: uid(), ...d.plan }] : [];
    if (d.ispo && !Array.isArray(d.ispoScans)) {
      if (d.ispo.observations?.length) next.ispoScans = [{ id: uid(), generatedAt: d.ispo.generatedAt, analyzed: d.ispo.analyzed || [], observations: d.ispo.observations }];
      if (d.ispo.ideas?.length) next.ideas = d.ispo.ideas.map((i) => ({ id: uid(), createdAt: d.ispo.generatedAt, source: i.fromBrief ? "brief" : "scan", brief: i.fromBrief || null, ...i }));
    }
    if (!Array.isArray(next.competitors) || !next.competitors.length) next.competitors = DEFAULT_COMPETITORS;
    delete next.plan; delete next.ispo;
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    (async () => {
      if (getKey()) {
        try { await loadData(); setAuthed(true); } catch (e) { localStorage.removeItem("dash-key"); }
      }
      setAuthChecking(false);
    })();
  }, [loadData]);

  const login = async () => {
    setAuthError("");
    localStorage.setItem("dash-key", pwd);
    try { await loadData(); setAuthed(true); }
    catch (e) { localStorage.removeItem("dash-key"); setAuthError(e.message === "AUTH" ? "Password errata." : `Errore: ${e.message}`); }
  };

  const persist = useCallback(async (next) => {
    setData(next);
    try { await api("/api/data", { method: "POST", body: JSON.stringify(next) }); }
    catch (e) { console.error("save", e); }
  }, []);

  /* ---------- competitor ---------- */
  const addCompetitor = () => {
    const name = newCompetitor.trim();
    if (!name || data.competitors.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    persist({ ...data, competitors: [...data.competitors, name] });
    setNewCompetitor("");
  };
  const removeCompetitor = (name) => persist({ ...data, competitors: data.competitors.filter((c) => c !== name) });

  /* ---------- attività ---------- */
  const addActivity = async () => {
    if (!form.title.trim() || !addFor) return;
    setEvaluating(true);
    let importance = 3, rationale = "";
    try {
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nSei il PR director del brand. Valuta il peso di questa attività di comunicazione verso lo stakeholder "${STAKEHOLDER_DEFS.find((s) => s.id === addFor)?.label}":\nTitolo: ${form.title}\nNote: ${form.notes || "—"}\n\nUsa TUTTA la scala 1-5, distinguendo con decisione. Ancore di riferimento:\n5 = evento raro e ad alto impatto (uscita su testata nazionale/internazionale importante, premio, AMA su Reddit riuscito, accordo con rivenditore prestigioso, servizio TV)\n4 = attività significativa non quotidiana (articolo su blog di settore rilevante, collaborazione con micro-influencer verticale, newsletter con lancio, presenza a fiera)\n3 = attività di mantenimento con valore (articolo sul proprio blog, video YouTube, partecipazione attiva a discussione di forum)\n2 = attività ordinaria a basso impatto (post Instagram standard, storia, commento su forum)\n1 = attività minima (repost, like ricevuto, menzione di passaggio, storia effimera)\nSii severo: un post social ordinario NON merita più di 2. Un'uscita stampa su testata minore vale 3-4, su testata maggiore 5.\n\nRispondi SOLO con JSON puro, senza backtick né testo extra:\n{"importance": <1-5>, "rationale": "<max 15 parole in italiano che giustificano il peso>"}`,
        false, 400
      );
      const j = extractJSON(txt);
      importance = Math.min(5, Math.max(1, j.importance));
      rationale = j.rationale || "";
    } catch (e) { rationale = "Valutazione automatica non disponibile — peso standard."; }

    const act = { id: uid(), title: form.title.trim(), notes: form.notes.trim(), date: form.date, importance, rationale };
    persist({ ...data, activities: { ...data.activities, [addFor]: [act, ...(data.activities[addFor] || [])] } });
    setForm({ title: "", notes: "", date: new Date().toISOString().slice(0, 10) });
    setAddFor(null);
    setEvaluating(false);
  };

  const removeActivity = (catId, actId) =>
    persist({ ...data, activities: { ...data.activities, [catId]: (data.activities[catId] || []).filter((a) => a.id !== actId) } });

  /* ---------- piano di volo (con storico) ---------- */
  const generatePlan = async () => {
    setPlanError(""); setPlanLoading(true);
    try {
      const snapshot = STAKEHOLDER_DEFS.map((s) => {
        const acts = data.activities[s.id] || [];
        const h = categoryHeat(acts, s.halfLifeDays);
        const recent = acts.slice(0, 4).map((a) => `- ${a.date}: ${a.title} (imp ${a.importance})`).join("\n") || "- nessuna attività registrata";
        return `## ${s.label} (calore attuale: ${h.toFixed(1)}, half-life ${s.halfLifeDays}gg)\n${recent}`;
      }).join("\n\n");
      const kpiTxt = data.kpis.slice(-12).map((k) => `${k.date} ${KPI_DEFS.find((d) => d.id === k.id)?.label}: ${k.value}`).join("\n") || "nessun KPI registrato";
      const prevPlan = data.plans[0]?.items?.slice(0, 7).map((i) => `- [${i.category}] ${i.action}`).join("\n") || "nessuno";

      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nOggi è ${new Date().toISOString().slice(0, 10)}. Sei un PR manager con 20 anni di esperienza nel lusso artigianale.\n\nStato attività per stakeholder:\n${snapshot}\n\nKPI recenti:\n${kpiTxt}\n\nPiano precedente (evita di ripetere identico ciò che era già pianificato, salvo sia ancora la priorità giusta):\n${prevPlan}\n\nPer OGNI categoria di stakeholder, proponi LA prossima azione concreta e QUANDO farla. Priorità alle categorie più fredde. Rispondi SOLO con JSON puro:\n{"items":[{"category":"<id tra: ${STAKEHOLDER_DEFS.map((s) => s.id).join(", ")}>","action":"<azione concreta, max 20 parole>","when":"<es. entro 7 giorni / settimana del 20 lug>","priority":<1-3, 1=urgente>}]}`,
        false, 1800
      );
      const j = extractJSON(txt);
      const p = { id: uid(), generatedAt: new Date().toISOString(), items: j.items || [] };
      persist({ ...data, plans: [p, ...data.plans].slice(0, 30) });
    } catch (e) { setPlanError(`Generazione non riuscita (${e.message}). Riprova.`); }
    setPlanLoading(false);
  };

  /* ---------- Ispo: scansione (con storico) ---------- */
  const activitiesDone = () =>
    Object.entries(data.activities).flatMap(([cat, acts]) => acts.slice(0, 5).map((a) => `[${cat}] ${a.title}`)).join("\n") || "nessuna attività registrata";

  const [ispoProgress, setIspoProgress] = useState("");
  const [noteEditing, setNoteEditing] = useState(null); // { scanId, idx }
  const [noteText, setNoteText] = useState("");

  const saveObsNote = (scanId, idx) => {
    persist({
      ...data,
      ispoScans: data.ispoScans.map((sc) =>
        sc.id === scanId
          ? { ...sc, observations: sc.observations.map((o, i) => (i === idx ? { ...o, userNote: noteText.trim() || null, userNoteAt: noteText.trim() ? new Date().toISOString() : null } : o)) }
          : sc
      ),
    });
    setNoteEditing(null);
    setNoteText("");
  };

  const generateIspo = async () => {
    setIspoError("");
    if (!data.competitors.length) { setIspoError("Aggiungi almeno un competitor da analizzare."); return; }
    setIspoLoading(true);
    try {
      const allObservations = [];
      const researchSummaries = [];

      /* FASE 1 — una ricerca web DEDICATA per ogni brand (5 ricerche ciascuno) */
      for (let bi = 0; bi < data.competitors.length; bi++) {
        const brand = data.competitors[bi];
        setIspoProgress(`Analisi ${bi + 1}/${data.competitors.length}: ${brand}…`);
        let research = "";
        try {
          research = await callClaude(
            `Sei un analista di competitive intelligence per il settore orologiero. Cerca sul web le attività di comunicazione e marketing RECENTI (ultimi 6-12 mesi) del brand orologiero "${brand}". Fai più ricerche mirate: collaborazioni e edizioni speciali, uscite stampa e recensioni, campagne social e community, eventi e fiere, lanci di prodotto.\n\nPer OGNI singola attività trovata, riporta con la massima specificità possibile:\n- COSA esattamente (meccanica: che tipo di collab/campagna/lancio, quanti pezzi, che prezzo se noto)\n- CHI è coinvolto (nome del partner, della testata, del designer, dell'evento)\n- QUANDO (data o mese preciso dalle fonti) e durata/stato\n- DOVE (canali: IG, YouTube, stampa specifica; mercati geografici)\n- Segnali di risultato se presenti (sold out, tempi di esaurimento, copertura ottenuta, numeri citati)\n\nNON generalizzare in strategie ("puntano sulle collaborazioni") — voglio i fatti specifici, uno per uno, con nomi e date. Se una informazione non c'è nelle fonti, dillo. Rispondi in italiano.`,
            true, 3000
          );
        } catch (e) {
          researchSummaries.push(`${brand}: ricerca fallita (${e.message})`);
          continue;
        }
        researchSummaries.push(`=== ${brand} ===\n${research}`);

        /* FASE 2 (per brand) — strutturazione con schema di intelligence completo */
        try {
          const txt = await callClaude(
            `${BRAND_CONTEXT}\n\nRisultati di ricerca sulle attività recenti di "${brand}":\n${research}\n\nStruttura OGNI attività specifica trovata come scheda di competitive intelligence. Una scheda per attività (non riassunti di strategia). Rispondi SOLO con JSON puro, senza backtick:\n{"observations":[{"who":"${brand}","what":"<titolo attività specifico, max 12 parole>","type":"<collaborazione|lancio prodotto|PR/stampa|evento|campagna social|altro>","partners":"<nomi di partner/testate/persone coinvolte, o 'non indicato'>","when":"<data o periodo dalle fonti, o 'non determinabile'>","duration":"<'in corso'|'one-shot'|'edizione limitata N pezzi'|durata|'non determinabile'>","where":"<canali e mercati, es. 'IG + stampa USA'>","mechanics":"<come funziona esattamente l'iniziativa, max 40 parole>","why":"<obiettivo strategico che rivela, max 20 parole>","impact":"<segnali di risultato dalle fonti: sold out, copertura, numeri; o 'non misurabile dalle fonti'>","implications":"<cosa dice sulle intenzioni del brand e sul mercato, max 25 parole>","takeaway":"<lezione operativa per Calamai: replicare/tradurre/evitare/spazio scoperto, max 25 parole>"}]}\nRegola ferrea: se un dato non emerge dalle fonti scrivi 'non determinabile' o 'non indicato' — MAI inventare nomi, date o numeri.`,
            false, 3000
          );
          const j = extractJSON(txt);
          allObservations.push(...(j.observations || []));
        } catch (e) { /* brand senza risultati strutturabili: si prosegue */ }
      }

      if (!allObservations.length) throw new Error("nessuna attività strutturabile trovata");

      /* FASE 3 — idee dal quadro completo */
      setIspoProgress("Generazione idee…");
      const prevIdeas = data.ideas.slice(0, 20).map((i) => `- ${i.title}`).join("\n") || "nessuna";
      const obsSummary = allObservations.map((o) => `- [${o.who}] ${o.what} (${o.when}) → takeaway: ${o.takeaway}`).join("\n");
      const prevNotes = data.ispoScans.flatMap((sc) => sc.observations.filter((o) => o.userNote).map((o) => `- [${o.who}] ${o.what}: ${o.userNote}`)).slice(0, 15).join("\n");
      const ideasTxt = await callClaude(
        `${BRAND_CONTEXT}\n\nAttività già svolte da Calamai:\n${activitiesDone()}\n\nIdee già proposte (NON riproporle):\n${prevIdeas}\n\nIntelligence raccolta sui competitor:\n${obsSummary}\n${prevNotes ? `\nNote manuali del PR manager su osservazioni precedenti (pesale molto — sono verifiche di prima mano):\n${prevNotes}\n` : ""}\nGenera 4-6 NUOVE idee di comunicazione per Calamai che sfruttino ciò che l'intelligence rivela (pattern che funzionano da tradurre nel territorio Calamai, spazi lasciati scoperti dai competitor), ciascuna con piano di attuazione in 3-5 passi concreti. Rispondi SOLO con JSON puro:\n{"ideas":[{"title":"<idea, max 10 parole>","detail":"<come applicarla a Calamai e da quale evidenza nasce, max 45 parole>","effort":"<basso|medio|alto>","plan":["<passo 1>","<passo 2>","<passo 3>"]}]}`,
        false, 2000
      );
      const ji = extractJSON(ideasTxt);
      const scan = { id: uid(), generatedAt: new Date().toISOString(), analyzed: [...data.competitors], observations: allObservations };
      const newIdeas = (ji.ideas || []).map((i) => ({ id: uid(), createdAt: scan.generatedAt, source: "scan", brief: null, ...i }));
      persist({ ...data, ispoScans: [scan, ...data.ispoScans].slice(0, 30), ideas: [...newIdeas, ...data.ideas] });
    } catch (e) { setIspoError(`Ricerca non riuscita (${e.message}). Riprova tra qualche istante.`); }
    setIspoProgress("");
    setIspoLoading(false);
  };

  /* ---------- Ispo: idee da brief ---------- */
  const generateMoreIdeas = async () => {
    setMoreIdeasError(""); setMoreIdeasLoading(true);
    try {
      const existing = data.ideas.slice(0, 25).map((i) => `- ${i.title}`).join("\n") || "nessuna";
      const marketNotes = (data.ispoScans[0]?.observations || []).map((o) => `- ${o.who}: ${o.what}${o.when ? ` (${o.when})` : ""}${o.takeaway ? ` → ${o.takeaway}` : ""}${o.userNote ? ` | nota del PR manager: ${o.userNote}` : ""}`).join("\n") || "nessuna scansione recente";
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nAttività già svolte da Calamai:\n${activitiesDone()}\n\nIdee già proposte in precedenza (NON ripeterle):\n${existing}\n\nOsservazioni recenti sul mercato:\n${marketNotes}\n\nBrief del PR manager per questa generazione: "${ideaBrief.trim() || "idee libere, purché coerenti col brand"}"\n\nGenera 3-5 NUOVE idee di comunicazione per Calamai che rispondano al brief, ciascuna con un principio di piano di attuazione in 3-5 passi concreti. Rispondi SOLO con JSON puro, senza backtick né testo extra:\n{"ideas":[{"title":"<idea, max 10 parole>","detail":"<come applicarla a Calamai, max 40 parole>","effort":"<basso|medio|alto>","plan":["<passo 1>","<passo 2>","<passo 3>"]}]}`,
        false, 2000
      );
      const j = extractJSON(txt);
      const now = new Date().toISOString();
      const newIdeas = (j.ideas || []).map((i) => ({ id: uid(), createdAt: now, source: "brief", brief: ideaBrief.trim() || null, ...i }));
      persist({ ...data, ideas: [...newIdeas, ...data.ideas] });
      setIdeaBrief("");
    } catch (e) { setMoreIdeasError(`Generazione non riuscita (${e.message}). Riprova.`); }
    setMoreIdeasLoading(false);
  };

  const removeIdea = (id) => persist({ ...data, ideas: data.ideas.filter((i) => i.id !== id) });

  /* ---------- Rassegna: menzioni ---------- */
  const addMention = () => {
    if (!mentionForm.title.trim()) return;
    const m = { id: uid(), ...mentionForm, title: mentionForm.title.trim(), addedAt: new Date().toISOString(), sentiment: null, relevance: null, note: null };
    persist({ ...data, mentions: [m, ...data.mentions] });
    setMentionForm({ title: "", url: "", source: "", date: new Date().toISOString().slice(0, 10) });
  };
  const removeMention = (id) => persist({ ...data, mentions: data.mentions.filter((m) => m.id !== id) });

  const classifyMentions = async () => {
    const pending = data.mentions.filter((m) => !m.sentiment);
    if (!pending.length) return;
    setClassifying(true);
    try {
      const listTxt = pending.slice(0, 15).map((m) => `ID:${m.id} | ${m.title} | fonte: ${m.source || "?"} | ${m.url || ""}`).join("\n");
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nClassifica queste menzioni del brand trovate online. Per ognuna valuta tono e rilevanza della fonte.\n${listTxt}\n\nRispondi SOLO con JSON puro:\n{"results":[{"id":"<ID>","sentiment":"<positivo|neutro|critico>","relevance":<1-5, 5=testata importante o community influente>,"note":"<max 12 parole: perché conta o non conta>"}]}`,
        false, 1500
      );
      const j = extractJSON(txt);
      const map = Object.fromEntries((j.results || []).map((r) => [r.id, r]));
      persist({ ...data, mentions: data.mentions.map((m) => (map[m.id] ? { ...m, sentiment: map[m.id].sentiment, relevance: map[m.id].relevance, note: map[m.id].note } : m)) });
    } catch (e) { console.error(e); }
    setClassifying(false);
  };

  /* ---------- Contatti media ---------- */
  const addContact = () => {
    if (!contactForm.name.trim()) return;
    const c = { id: uid(), ...contactForm, name: contactForm.name.trim(), interactions: [], createdAt: new Date().toISOString() };
    persist({ ...data, contacts: [c, ...data.contacts] });
    setContactForm({ name: "", outlet: "", email: "", beat: "" });
    setShowContactForm(false);
  };
  const removeContact = (id) => persist({ ...data, contacts: data.contacts.filter((c) => c.id !== id) });

  const addInteraction = (contactId) => {
    if (!interactionText.trim()) return;
    persist({
      ...data,
      contacts: data.contacts.map((c) =>
        c.id === contactId ? { ...c, interactions: [{ id: uid(), date: new Date().toISOString().slice(0, 10), what: interactionText.trim() }, ...c.interactions] } : c
      ),
    });
    setInteractionText(""); setInteractionFor(null);
  };

  const contactHeat = (c) => {
    const last = c.interactions[0];
    if (!last) return 0;
    return 3 * Math.pow(0.5, daysAgo(last.date) / 45);
  };

  const suggestPitch = async (c) => {
    setPitchLoading(c.id);
    try {
      const history = c.interactions.slice(0, 5).map((i) => `- ${i.date}: ${i.what}`).join("\n") || "nessuna interazione precedente";
      const research = await callClaude(
        `Cerca sul web gli articoli e i contenuti recenti di ${c.name}${c.outlet ? ` (${c.outlet})` : ""}, giornalista/creator che copre: ${c.beat || "orologeria"}. Riassumi in italiano i temi trattati di recente e lo stile.`,
        true, 1500
      );
      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nContatto media: ${c.name}${c.outlet ? `, ${c.outlet}` : ""}${c.beat ? `, copre: ${c.beat}` : ""}\nStorico interazioni:\n${history}\n\nRicerca sui suoi contenuti recenti:\n${research}\n\nSuggerisci l'angolo di pitch perfetto per proporre Calamai a QUESTO contatto specifico, ora. Rispondi SOLO con JSON puro:\n{"angle":"<l'angolo in max 30 parole>","hook":"<la prima frase del pitch, max 25 parole, in italiano>","timing":"<perché ora, max 15 parole>"}`,
        false, 800
      );
      const j = extractJSON(txt);
      persist({ ...data, contacts: data.contacts.map((x) => (x.id === c.id ? { ...x, pitch: { ...j, generatedAt: new Date().toISOString() } } : x)) });
    } catch (e) { console.error(e); }
    setPitchLoading(null);
  };

  /* ---------- Report mensile ---------- */
  const generateReport = async () => {
    setReportError(""); setReportLoading(true);
    try {
      const now = new Date();
      const period = now.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
      const cutoff = new Date(now.getTime() - 30 * 86400000);
      const recentActs = Object.entries(data.activities)
        .flatMap(([cat, acts]) => acts.filter((a) => new Date(a.date) >= cutoff).map((a) => `- [${STAKEHOLDER_DEFS.find((s) => s.id === cat)?.label}] ${a.date}: ${a.title} (peso ${a.importance})`))
        .join("\n") || "nessuna attività nel periodo";
      const recentMentions = data.mentions.filter((m) => new Date(m.date) >= cutoff).map((m) => `- ${m.date}: ${m.title} (${m.source || "?"}, ${m.sentiment || "non classificata"})`).join("\n") || "nessuna menzione nel periodo";
      const kpiTxt = KPI_DEFS.map((d) => {
        const hist = data.kpis.filter((k) => k.id === d.id).sort((a, b) => a.ts - b.ts);
        if (!hist.length) return null;
        const last = hist[hist.length - 1], prev = hist.length > 1 ? hist[hist.length - 2] : null;
        return `- ${d.label}: ${last.value}${prev ? ` (precedente: ${prev.value})` : ""}`;
      }).filter(Boolean).join("\n") || "nessun KPI registrato";
      const nextPlan = data.plans[0]?.items?.slice(0, 7).map((i) => `- ${i.action} (${i.when})`).join("\n") || "da definire";

      const txt = await callClaude(
        `${BRAND_CONTEXT}\n\nScrivi il report mensile di comunicazione (${period}) destinato a Francesco Calamai, titolare del brand. Tono professionale ma diretto, in italiano, formato markdown con sezioni: Sintesi del mese, Attività svolte, Rassegna stampa e menzioni, Andamento KPI, Prossimi passi. Basati SOLO su questi dati, senza inventare numeri o attività:\n\nATTIVITÀ ULTIMI 30 GIORNI:\n${recentActs}\n\nMENZIONI ULTIMI 30 GIORNI:\n${recentMentions}\n\nKPI:\n${kpiTxt}\n\nPIANO CORRENTE:\n${nextPlan}\n\nSii onesto: se un'area è scoperta o un numero è fermo, dillo con garbo ma dillo. Massimo 500 parole.`,
        false, 2000
      );
      const rep = { id: uid(), generatedAt: new Date().toISOString(), period, text: txt };
      persist({ ...data, reports: [rep, ...data.reports].slice(0, 24) });
    } catch (e) { setReportError(`Generazione non riuscita (${e.message}). Riprova.`); }
    setReportLoading(false);
  };

  /* ---------- KPI ---------- */
  const addKpi = () => {
    if (!kpiForm.value) return;
    persist({ ...data, kpis: [...data.kpis, { ...kpiForm, value: parseFloat(kpiForm.value), ts: Date.now() }] });
    setKpiForm({ ...kpiForm, value: "" });
  };

  const kpiLatest = useMemo(() => {
    const m = {};
    KPI_DEFS.forEach((d) => {
      const hist = data.kpis.filter((k) => k.id === d.id).sort((a, b) => a.ts - b.ts);
      if (hist.length) m[d.id] = { ...hist[hist.length - 1], prev: hist.length > 1 ? hist[hist.length - 2].value : null };
    });
    return m;
  }, [data.kpis]);

  /* ---------- styles ---------- */
  const S = {
    app: { minHeight: "100vh", background: T.cream, color: T.ink, fontFamily: "'Inter', system-ui, sans-serif" },
    mono: { fontFamily: "'Space Grotesk', 'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.12em" },
    serif: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 600 },
    card: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 4 },
    btn: { background: T.ink, color: T.cream, border: "none", padding: "10px 18px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 11, borderRadius: 3 },
    btnRed: { background: T.red },
    btnGhost: { background: "transparent", color: T.ink, border: `1px solid ${T.line}` },
    input: { width: "100%", padding: "9px 10px", border: `1px solid ${T.line}`, borderRadius: 3, fontSize: 13, background: T.cream, color: T.ink, boxSizing: "border-box" },
    chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 20, padding: "5px 12px", fontSize: 12 },
    h2: { margin: 0, fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 600 },
    sub: { fontSize: 12, color: T.grey, margin: "4px 0 0" },
  };

  if (authChecking) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={S.mono}>Caricamento…</span></div>;

  if (!authed) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.card, padding: 32, width: 340, textAlign: "center" }}>
        <div style={{ ...S.mono, fontSize: 10, color: T.red }}>Orologi Calamai</div>
        <h1 style={{ ...S.serif, fontSize: 24, margin: "6px 0 20px" }}>Torre di Controllo</h1>
        <input style={S.input} type="password" placeholder="Password" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} autoFocus />
        {authError && <div style={{ color: T.red, fontSize: 12, marginTop: 8 }}>{authError}</div>}
        <button style={{ ...S.btn, ...S.btnRed, width: "100%", marginTop: 12 }} onClick={login}>Accedi</button>
      </div>
    </div>
  );

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

  const IdeaCard = ({ idea }) => (
    <div style={{ ...S.card, padding: "12px 16px", marginBottom: 8, borderLeft: `3px solid ${T.ink}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{idea.title}</span>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ ...S.mono, fontSize: 9, color: idea.effort === "basso" ? T.green : idea.effort === "alto" ? T.red : T.amber }}>sforzo {idea.effort}</span>
          <button onClick={() => removeIdea(idea.id)} title="Elimina idea" style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 13, padding: 0 }}>×</button>
        </span>
      </div>
      <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4 }}>{idea.detail}</div>
      <div style={{ fontSize: 10, color: T.grey, marginTop: 4 }}>
        {idea.createdAt ? fmtDT(idea.createdAt) : ""} · {idea.source === "brief" ? `da brief${idea.brief ? `: “${idea.brief}”` : ""}` : "da scansione competitor"}
      </div>
      {Array.isArray(idea.plan) && idea.plan.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ ...S.mono, fontSize: 10, color: T.red, cursor: "pointer" }}>Piano di attuazione</summary>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: T.inkSoft }}>
            {idea.plan.map((step, si) => <li key={si} style={{ marginBottom: 4 }}>{step}</li>)}
          </ol>
        </details>
      )}
    </div>
  );

  const TABS = [
    ["radar", "Radar"], ["piano", "Piano di volo"], ["ispo", "Ispo"],
    ["rassegna", "Rassegna"], ["contatti", "Contatti"], ["report", "Report"], ["kpi", "Strumenti"],
  ];

  return (
    <div style={S.app}>
      <header style={{ borderBottom: `1px solid ${T.line}`, padding: "20px 24px", display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ ...S.mono, fontSize: 10, color: T.red }}>Orologi Calamai — Ufficio Comunicazione</div>
          <h1 style={{ ...S.serif, margin: "4px 0 0", fontSize: 26 }}>Torre di Controllo</h1>
        </div>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ ...S.btn, background: tab === id ? T.red : "transparent", color: tab === id ? T.cream : T.ink, border: `1px solid ${tab === id ? T.red : T.line}`, padding: "8px 12px" }}>
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
              const acts = data.activities[s.id] || [];
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
                    {acts.slice(0, 4).map((a) => (
                      <div key={a.id} style={{ borderTop: `1px solid ${T.line}`, padding: "7px 0", fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontWeight: 500 }}>{a.title}</span>
                          <button onClick={() => removeActivity(s.id, a.id)} title="Elimina" style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 12, padding: 0 }}>×</button>
                        </div>
                        <div style={{ color: T.grey, fontSize: 10, marginTop: 2 }}>
                          {a.date} · peso {a.importance}/5 · calore residuo {heat(a, s.halfLifeDays).toFixed(1)}{a.rationale ? ` · ${a.rationale}` : ""}
                        </div>
                      </div>
                    ))}
                    {acts.length > 4 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ ...S.mono, fontSize: 9, color: T.grey, cursor: "pointer" }}>Archivio completo ({acts.length} attività)</summary>
                        {acts.slice(4).map((a) => (
                          <div key={a.id} style={{ borderTop: `1px solid ${T.line}`, padding: "6px 0", fontSize: 11 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <span>{a.title}</span>
                              <button onClick={() => removeActivity(s.id, a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 11, padding: 0 }}>×</button>
                            </div>
                            <div style={{ color: T.grey, fontSize: 9 }}>{a.date} · peso {a.importance}/5{a.rationale ? ` · ${a.rationale}` : ""}</div>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>

                  {addFor === s.id ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                      <input style={S.input} placeholder="Cosa è stato fatto? (es. Pitch inviato a Worn & Wound)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                      <input style={S.input} placeholder="Note (opzionale)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                      <input style={S.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...S.btn, ...S.btnRed, flex: 1 }} onClick={addActivity} disabled={evaluating}>{evaluating ? "Valutazione…" : "Registra"}</button>
                        <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setAddFor(null)}>Annulla</button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...S.btn, marginTop: 10, background: "transparent", color: T.ink, border: `1px dashed ${T.grey}` }} onClick={() => setAddFor(s.id)}>+ Aggiungi attività</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============ PIANO DI VOLO ============ */}
        {tab === "piano" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={S.h2}>Piano di volo</h2>
                <p style={S.sub}>Prossime azioni per categoria. Ogni proiezione resta in archivio.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={generatePlan} disabled={planLoading}>{planLoading ? "Analisi in corso…" : "Genera proiezione"}</button>
            </div>
            {planError && <p style={{ color: T.red, fontSize: 13 }}>{planError}</p>}

            {data.plans[0] && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 8 }}>Piano corrente — generato {fmtDT(data.plans[0].generatedAt)}</div>
                {[1, 2, 3].map((p) => {
                  const items = data.plans[0].items.filter((i) => i.priority === p);
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

            {data.plans.length > 1 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ ...S.mono, fontSize: 11, color: T.red, cursor: "pointer" }}>Archivio piani precedenti ({data.plans.length - 1})</summary>
                {data.plans.slice(1).map((pl) => (
                  <div key={pl.id} style={{ ...S.card, padding: 14, marginTop: 10 }}>
                    <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 6 }}>{fmtDT(pl.generatedAt)}</div>
                    {pl.items.map((it, i) => (
                      <div key={i} style={{ fontSize: 12, padding: "4px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                        <span style={{ ...S.mono, fontSize: 8, color: T.grey }}>{STAKEHOLDER_DEFS.find((s) => s.id === it.category)?.label || it.category}</span> — {it.action} <span style={{ color: T.grey }}>({it.when})</span>
                      </div>
                    ))}
                  </div>
                ))}
              </details>
            )}
            {!data.plans.length && !planLoading && <p style={{ fontSize: 13, color: T.grey, marginTop: 20 }}>Registra qualche attività nel Radar, poi genera la prima proiezione.</p>}
          </div>
        )}

        {/* ============ ISPO ============ */}
        {tab === "ispo" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={S.h2}>Ispo</h2>
                <p style={S.sub}>Ricerca web live sui competitor che scegli tu. Ogni scansione resta in archivio; le idee si accumulano.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={generateIspo} disabled={ispoLoading}>{ispoLoading ? (ispoProgress || "Ricerca web in corso…") : "Scansiona competitor"}</button>
            </div>

            <div style={{ ...S.card, padding: 14, marginTop: 14 }}>
              <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>Competitor da analizzare</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {data.competitors.map((c) => (
                  <span key={c} style={S.chip}>
                    {c}
                    <button onClick={() => removeCompetitor(c)} title="Rimuovi" style={{ background: "none", border: "none", cursor: "pointer", color: T.red, fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {data.competitors.length === 0 && <span style={{ fontSize: 12, color: T.grey, fontStyle: "italic" }}>Nessun competitor in lista.</span>}
              </div>
              <div style={{ display: "flex", gap: 6, maxWidth: 420 }}>
                <input style={S.input} placeholder="Aggiungi brand (es. Serica, Ollech & Wajs…)" value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCompetitor()} />
                <button style={S.btn} onClick={addCompetitor}>+</button>
              </div>
              <div style={{ fontSize: 10, color: T.grey, marginTop: 8 }}>Consiglio: 3-6 brand per scansione. La ricerca web fa fino a 5 ricerche per giro — con liste lunghe l'analisi diventa più superficiale.</div>
            </div>

            {ispoError && <p style={{ color: T.red, fontSize: 13 }}>{ispoError}</p>}

            {data.ispoScans[0] && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 8 }}>
                  Ultima scansione: {fmtDT(data.ispoScans[0].generatedAt)} <span style={{ color: T.green }}>· ricerca web live</span> · brand: {data.ispoScans[0].analyzed.join(", ")}
                </div>
                <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Osservato sul mercato</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
                  {data.ispoScans[0].observations.map((o, i) => (
                    <div key={i} style={{ ...S.card, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ ...S.mono, fontSize: 10, color: T.red }}>{o.who}</span>
                        {o.type && <span style={{ ...S.mono, fontSize: 8, color: T.grey, border: `1px solid ${T.line}`, borderRadius: 10, padding: "2px 8px" }}>{o.type}</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{o.what}</div>
                      {(o.mechanics || o.detail) && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>{o.mechanics || o.detail}</div>}
                      <div style={{ display: "grid", gap: 3, marginTop: 8, fontSize: 11 }}>
                        {o.partners && o.partners !== "non indicato" && <div><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>CHI</b> {o.partners}</div>}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {o.when && <span><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>QUANDO</b> {o.when}</span>}
                          {o.duration && <span><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>DURATA</b> {o.duration}</span>}
                        </div>
                        {o.where && <div><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>DOVE</b> {o.where}</div>}
                        {o.why && <div><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>PERCHÉ</b> {o.why}</div>}
                        {o.impact && <div><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>IMPATTO</b> {o.impact}</div>}
                        {o.implications && <div><b style={{ ...S.mono, fontSize: 8, color: T.grey }}>IMPLICAZIONI</b> {o.implications}</div>}
                      </div>
                      {o.takeaway && (
                        <div style={{ background: T.paper, borderRadius: 3, padding: "8px 10px", marginTop: 8, fontSize: 12 }}>
                          <span style={{ ...S.mono, fontSize: 8, color: T.red }}>PER CALAMAI</span> {o.takeaway}
                        </div>
                      )}
                      {noteEditing && noteEditing.scanId === data.ispoScans[0].id && noteEditing.idx === i ? (
                        <div style={{ marginTop: 8 }}>
                          <textarea
                            style={{ ...S.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                            placeholder="Le tue note: dettagli raccolti, fonti, valutazioni…"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            autoFocus
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button style={{ ...S.btn, ...S.btnRed, padding: "6px 12px" }} onClick={() => saveObsNote(data.ispoScans[0].id, i)}>Salva</button>
                            <button style={{ ...S.btn, ...S.btnGhost, padding: "6px 12px" }} onClick={() => { setNoteEditing(null); setNoteText(""); }}>Annulla</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {o.userNote && (
                            <div style={{ borderLeft: `3px solid ${T.amber}`, background: "#fdfaf2", borderRadius: 3, padding: "8px 10px", marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
                              <span style={{ ...S.mono, fontSize: 8, color: T.amber }}>NOTA MIA{o.userNoteAt ? ` · ${fmtDT(o.userNoteAt)}` : ""}</span>
                              <div style={{ marginTop: 2 }}>{o.userNote}</div>
                            </div>
                          )}
                          <button
                            style={{ ...S.btn, ...S.btnGhost, padding: "5px 10px", fontSize: 9, marginTop: 8 }}
                            onClick={() => { setNoteEditing({ scanId: data.ispoScans[0].id, idx: i }); setNoteText(o.userNote || ""); }}
                          >
                            {o.userNote ? "Modifica nota" : "+ Aggiungi nota"}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.ispoScans.length > 1 && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ ...S.mono, fontSize: 11, color: T.red, cursor: "pointer" }}>Archivio scansioni ({data.ispoScans.length - 1})</summary>
                {data.ispoScans.slice(1).map((sc) => (
                  <div key={sc.id} style={{ ...S.card, padding: 14, marginTop: 10 }}>
                    <div style={{ ...S.mono, fontSize: 10, color: T.grey, marginBottom: 6 }}>{fmtDT(sc.generatedAt)} · {sc.analyzed.join(", ")}</div>
                    {sc.observations.map((o, i) => (
                      <div key={i} style={{ fontSize: 12, padding: "6px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                        <span style={{ ...S.mono, fontSize: 8, color: T.red }}>{o.who}</span> — <b>{o.what}</b>
                        {(o.mechanics || o.detail) ? ` · ${o.mechanics || o.detail}` : ""}{o.when ? ` · ${o.when}` : ""}{o.duration ? ` · ${o.duration}` : ""}
                        {o.userNote && (
                          <div style={{ borderLeft: `2px solid ${T.amber}`, paddingLeft: 8, marginTop: 4, color: T.inkSoft, whiteSpace: "pre-wrap" }}>
                            <span style={{ ...S.mono, fontSize: 8, color: T.amber }}>NOTA MIA</span> {o.userNote}
                          </div>
                        )}
                        {noteEditing && noteEditing.scanId === sc.id && noteEditing.idx === i ? (
                          <div style={{ marginTop: 6 }}>
                            <textarea style={{ ...S.input, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <button style={{ ...S.btn, ...S.btnRed, padding: "5px 10px", fontSize: 9 }} onClick={() => saveObsNote(sc.id, i)}>Salva</button>
                              <button style={{ ...S.btn, ...S.btnGhost, padding: "5px 10px", fontSize: 9 }} onClick={() => { setNoteEditing(null); setNoteText(""); }}>Annulla</button>
                            </div>
                          </div>
                        ) : (
                          <button style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 10, padding: 0, marginTop: 3, textDecoration: "underline" }} onClick={() => { setNoteEditing({ scanId: sc.id, idx: i }); setNoteText(o.userNote || ""); }}>
                            {o.userNote ? "modifica nota" : "+ nota"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </details>
            )}

            {data.ideas.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Idee per Calamai ({data.ideas.length})</div>
                {data.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
              </div>
            )}

            <div style={{ ...S.card, padding: 14, marginTop: 20 }}>
              <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>Genera nuove idee</div>
              <textarea
                style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Brief per l'LLM (es. 'idee low budget per il periodo natalizio', 'qualcosa che coinvolga la community dei piloti'). Vuoto = idee libere."
                value={ideaBrief}
                onChange={(e) => setIdeaBrief(e.target.value)}
              />
              {moreIdeasError && <div style={{ color: T.red, fontSize: 12, marginTop: 6 }}>{moreIdeasError}</div>}
              <button style={{ ...S.btn, ...S.btnRed, marginTop: 8 }} onClick={generateMoreIdeas} disabled={moreIdeasLoading}>{moreIdeasLoading ? "Generazione…" : "Genera altre idee"}</button>
              <div style={{ fontSize: 10, color: T.grey, marginTop: 6 }}>Le nuove idee si aggiungono all'elenco, senza ripetere le esistenti. Tengono conto delle attività svolte e dell'ultima scansione.</div>
            </div>
          </div>
        )}

        {/* ============ RASSEGNA ============ */}
        {tab === "rassegna" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={S.h2}>Rassegna</h2>
                <p style={S.sub}>Menzioni del brand online. Arrivano da N8N (Google Alerts) o si inseriscono a mano; l'LLM classifica tono e rilevanza.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={classifyMentions} disabled={classifying || !data.mentions.some((m) => !m.sentiment)}>
                {classifying ? "Classificazione…" : `Classifica nuove (${data.mentions.filter((m) => !m.sentiment).length})`}
              </button>
            </div>

            <div style={{ ...S.card, padding: 14, marginTop: 14, maxWidth: 560 }}>
              <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>Aggiungi menzione manualmente</div>
              <div style={{ display: "grid", gap: 6 }}>
                <input style={S.input} placeholder="Titolo / testo della menzione" value={mentionForm.title} onChange={(e) => setMentionForm({ ...mentionForm, title: e.target.value })} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={S.input} placeholder="Fonte (es. WatchUSeek)" value={mentionForm.source} onChange={(e) => setMentionForm({ ...mentionForm, source: e.target.value })} />
                  <input style={S.input} type="date" value={mentionForm.date} onChange={(e) => setMentionForm({ ...mentionForm, date: e.target.value })} />
                </div>
                <input style={S.input} placeholder="URL (opzionale)" value={mentionForm.url} onChange={(e) => setMentionForm({ ...mentionForm, url: e.target.value })} />
                <button style={{ ...S.btn, ...S.btnRed }} onClick={addMention}>Registra menzione</button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              {data.mentions.length === 0 && <p style={{ fontSize: 13, color: T.grey }}>Nessuna menzione ancora. Quando il workflow N8N sarà attivo, arriveranno qui da sole.</p>}
              {data.mentions.map((m) => {
                const sColor = m.sentiment === "positivo" ? T.green : m.sentiment === "critico" ? T.red : m.sentiment === "neutro" ? T.grey : T.amber;
                return (
                  <div key={m.id} style={{ ...S.card, padding: "12px 16px", marginBottom: 8, borderLeft: `3px solid ${sColor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{m.url ? <a href={m.url} target="_blank" rel="noreferrer" style={{ color: T.ink }}>{m.title}</a> : m.title}</span>
                      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ ...S.mono, fontSize: 9, color: sColor }}>{m.sentiment || "da classificare"}</span>
                        <button onClick={() => removeMention(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 13, padding: 0 }}>×</button>
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: T.grey, marginTop: 3 }}>
                      {m.date} · {m.source || "fonte sconosciuta"}
                      {m.relevance != null && <> · rilevanza {m.relevance}/5</>}
                      {m.note && <> · {m.note}</>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ CONTATTI ============ */}
        {tab === "contatti" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={S.h2}>Contatti media</h2>
                <p style={S.sub}>I 30-50 giornalisti e creator che contano per Calamai. Ogni interazione registrata mantiene calda la relazione.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={() => setShowContactForm(!showContactForm)}>{showContactForm ? "Chiudi" : "+ Nuovo contatto"}</button>
            </div>

            {showContactForm && (
              <div style={{ ...S.card, padding: 14, marginTop: 14, maxWidth: 560 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <input style={S.input} placeholder="Nome e cognome" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input style={S.input} placeholder="Testata / canale" value={contactForm.outlet} onChange={(e) => setContactForm({ ...contactForm, outlet: e.target.value })} />
                    <input style={S.input} placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                  </div>
                  <input style={S.input} placeholder="Cosa copre (es. microbrand, orologeria vintage, lifestyle)" value={contactForm.beat} onChange={(e) => setContactForm({ ...contactForm, beat: e.target.value })} />
                  <button style={{ ...S.btn, ...S.btnRed }} onClick={addContact}>Salva contatto</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {data.contacts.length === 0 && <p style={{ fontSize: 13, color: T.grey }}>Nessun contatto ancora. Inizia dai giornalisti che hanno già coperto microbrand simili.</p>}
              {data.contacts.map((c) => {
                const h = contactHeat(c);
                const st = heatStatus(h);
                return (
                  <div key={c.id} style={{ ...S.card, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: T.grey }}>{[c.outlet, c.beat].filter(Boolean).join(" · ")}</div>
                        {c.email && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{c.email}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ ...S.mono, fontSize: 9, color: st.color, fontWeight: 700 }}>{c.interactions.length ? st.label : "MAI CONTATTATO"}</span>
                        <div><button onClick={() => removeContact(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, fontSize: 13, padding: 0, marginTop: 4 }}>×</button></div>
                      </div>
                    </div>

                    {c.interactions.slice(0, 3).map((i) => (
                      <div key={i.id} style={{ fontSize: 11, color: T.inkSoft, borderTop: `1px solid ${T.line}`, padding: "5px 0" }}>{i.date} — {i.what}</div>
                    ))}
                    {c.interactions.length > 3 && (
                      <details><summary style={{ ...S.mono, fontSize: 9, color: T.grey, cursor: "pointer", marginTop: 4 }}>Storico completo ({c.interactions.length})</summary>
                        {c.interactions.slice(3).map((i) => <div key={i.id} style={{ fontSize: 11, color: T.inkSoft, padding: "3px 0" }}>{i.date} — {i.what}</div>)}
                      </details>
                    )}

                    {c.pitch && (
                      <div style={{ background: T.paper, borderRadius: 3, padding: 10, marginTop: 8, fontSize: 12 }}>
                        <div style={{ ...S.mono, fontSize: 9, color: T.red, marginBottom: 4 }}>Angolo di pitch suggerito · {fmtDT(c.pitch.generatedAt)}</div>
                        <div><b>Angolo:</b> {c.pitch.angle}</div>
                        <div style={{ marginTop: 3 }}><b>Apertura:</b> “{c.pitch.hook}”</div>
                        <div style={{ marginTop: 3, color: T.grey }}>{c.pitch.timing}</div>
                      </div>
                    )}

                    {interactionFor === c.id ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <input style={S.input} placeholder="es. Inviato pitch G50, risposto interessato" value={interactionText} onChange={(e) => setInteractionText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInteraction(c.id)} autoFocus />
                        <button style={{ ...S.btn, ...S.btnRed }} onClick={() => addInteraction(c.id)}>OK</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button style={{ ...S.btn, ...S.btnGhost, flex: 1, padding: "7px 8px" }} onClick={() => { setInteractionFor(c.id); setInteractionText(""); }}>+ Interazione</button>
                        <button style={{ ...S.btn, ...S.btnGhost, flex: 1, padding: "7px 8px" }} onClick={() => suggestPitch(c)} disabled={pitchLoading === c.id}>{pitchLoading === c.id ? "Ricerca…" : "Suggerisci pitch"}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ REPORT ============ */}
        {tab === "report" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={S.h2}>Report</h2>
                <p style={S.sub}>Report mensile per Francesco, generato dai dati reali della Torre: attività, menzioni, KPI e piano corrente.</p>
              </div>
              <button style={{ ...S.btn, ...S.btnRed }} onClick={generateReport} disabled={reportLoading}>{reportLoading ? "Scrittura in corso…" : "Genera report mese"}</button>
            </div>
            {reportError && <p style={{ color: T.red, fontSize: 13 }}>{reportError}</p>}

            {data.reports.map((r, idx) => (
              <details key={r.id} open={idx === 0} style={{ ...S.card, padding: 16, marginTop: 14 }}>
                <summary style={{ cursor: "pointer" }}>
                  <span style={{ ...S.serif, fontSize: 16 }}>Report {r.period}</span>
                  <span style={{ ...S.mono, fontSize: 9, color: T.grey, marginLeft: 10 }}>{fmtDT(r.generatedAt)}</span>
                </summary>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, marginTop: 12, color: T.inkSoft }}>{r.text}</div>
                <button style={{ ...S.btn, ...S.btnGhost, marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(r.text)}>Copia testo</button>
              </details>
            ))}
            {!data.reports.length && !reportLoading && <p style={{ fontSize: 13, color: T.grey, marginTop: 20 }}>Nessun report ancora. Il primo si genera con un click — servono un po' di attività e KPI registrati per dargli sostanza.</p>}
          </div>
        )}

        {/* ============ KPI ============ */}
        {tab === "kpi" && (
          <div>
            <h2 style={S.h2}>Strumenti di bordo</h2>
            <p style={{ ...S.sub, marginBottom: 16 }}>I KPI arrivano automaticamente dai workflow N8N (GSC, Instagram) via webhook. L'inserimento manuale resta come integrazione o correzione.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
              {KPI_DEFS.map((d) => {
                const latest = kpiLatest[d.id];
                const delta = latest?.prev != null ? latest.value - latest.prev : null;
                return (
                  <div key={d.id} style={{ ...S.card, padding: 14 }}>
                    <div style={{ ...S.mono, fontSize: 9, color: T.grey }}>{d.group}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "'Fraunces', Georgia, serif", marginTop: 6 }}>{latest ? latest.value.toLocaleString("it-IT") : "—"}</div>
                    {delta != null && <div style={{ fontSize: 11, color: delta >= 0 ? T.green : T.red, fontWeight: 600 }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString("it-IT")} vs rilevazione precedente</div>}
                    {latest && <div style={{ fontSize: 10, color: T.grey, marginTop: 2 }}>al {latest.date}</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ ...S.card, padding: 16, maxWidth: 480 }}>
              <div style={{ ...S.mono, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Nuova rilevazione manuale</div>
              <div style={{ display: "grid", gap: 8 }}>
                <select style={S.input} value={kpiForm.id} onChange={(e) => setKpiForm({ ...kpiForm, id: e.target.value })}>
                  {KPI_DEFS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                <input style={S.input} type="number" placeholder="Valore" value={kpiForm.value} onChange={(e) => setKpiForm({ ...kpiForm, value: e.target.value })} />
                <input style={S.input} type="date" value={kpiForm.date} onChange={(e) => setKpiForm({ ...kpiForm, date: e.target.value })} />
                <button style={{ ...S.btn, ...S.btnRed }} onClick={addKpi}>Registra rilevazione</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: `1px solid ${T.line}`, padding: "14px 24px", ...S.mono, fontSize: 9, color: T.grey, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span>Dal cielo al polso</span>
        <button onClick={() => { localStorage.removeItem("dash-key"); window.location.reload(); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.grey, ...S.mono, fontSize: 9, padding: 0 }}>Esci</button>
      </footer>
    </div>
  );
}
