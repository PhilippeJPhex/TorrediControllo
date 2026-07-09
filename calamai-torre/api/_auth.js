// Autenticazione semplice: password condivisa in header.
// Sufficiente per uno strumento interno a 1-2 utenti.
export function checkAuth(req) {
  const token = req.headers["x-dashboard-key"];
  return Boolean(token && token === process.env.DASHBOARD_PASSWORD);
}
