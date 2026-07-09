# Torre di Controllo — Orologi Calamai

Dashboard privata per la gestione della comunicazione: attività per stakeholder con scoring LLM e decadimento temporale, proiezioni "Piano di volo", monitoraggio competitor con web search reale (sezione Ispo), KPI automatici da N8N.

## Deploy in 5 passi

1. **Push su GitHub** (repo privato) e importa il progetto su [vercel.com](https://vercel.com) → Add New → Project (preset: Vite).
2. **Storage → Create Database → KV** → Connect to project (le variabili KV_* si aggiungono da sole).
3. **Settings → Environment Variables**, aggiungi:

   | Nome | Valore |
   |---|---|
   | `ANTHROPIC_API_KEY` | chiave da console.anthropic.com |
   | `DASHBOARD_PASSWORD` | password di accesso alla dashboard |
   | `INGEST_KEY` | stringa casuale lunga per il webhook N8N (`openssl rand -hex 24`) |

4. **Redeploy** (Deployments → ⋯ → Redeploy) per applicare le variabili.
5. Apri l'URL del progetto → login con la password.

## Webhook per N8N

`POST /api/ingest` con header `x-ingest-key: <INGEST_KEY>`:

```json
{ "kpis": [ { "id": "ig_followers", "value": 512, "date": "2026-07-09" } ] }
```

ID validi: `ig_followers`, `ig_engagement`, `gsc_clicks`, `gsc_impressions`, `newsletter`, `visioni`.

Test rapido:

```bash
curl -X POST https://TUO-PROGETTO.vercel.app/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: LA_TUA_INGEST_KEY" \
  -d '{"kpis":[{"id":"ig_followers","value":123}]}'
```

## Sviluppo locale

```bash
npm install
vercel dev   # serve frontend + API insieme (richiede vercel CLI e le env in .env)
```

## Sicurezza

- Repo privato, sempre.
- Imposta un limite di spesa mensile su console.anthropic.com.
- Tre segreti separati: se uno trapela, ruoti solo quello.
