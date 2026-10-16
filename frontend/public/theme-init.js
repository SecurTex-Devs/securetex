/* Fija el tema antes de pintar para evitar el destello. Archivo estático (sin
   dangerouslySetInnerHTML) cargado con el nonce de la CSP. Solo lee la
   preferencia de interfaz: ningún dato sensible vive en localStorage. */
(function () {
  try {
    var v = localStorage.getItem('stx-theme');
    var dark = v === 'dark' || (v !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
