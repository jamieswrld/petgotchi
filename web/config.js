// Runtime config for the Gotchi web app.
//
// CURRENT SETUP (GitHub Pages): GOTCHI_API is empty, so saves are per-device
// (localStorage) and no save requests are sent.
//
// To enable cross-device saves later, deploy the backend (a free Cloudflare Worker
// built from functions/api/save.js) and put its URL here, e.g.:
//   window.GOTCHI_API = "https://gotchi-saves.<your-subdomain>.workers.dev";
window.GOTCHI_API = "";
