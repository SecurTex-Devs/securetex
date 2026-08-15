/* SecurTex · prototipo de mockups
   Inyecta la barra de navegación común, el conmutador de tema y el de anotaciones. */

const PAGINAS = [
  { href: 'index.html',            texto: 'Índice' },
  { href: '01-acceso.html',        texto: '1 · Acceso' },
  { href: '02-panel.html',         texto: '2 · Panel' },
  { href: '03-editor.html',        texto: '3 · Editor' },
  { href: '04-cuenta.html',        texto: '4 · Cuenta' },
  { href: '05-plantillas.html',    texto: '5 · Plantillas' },
  { href: '06-administracion.html',texto: '6 · Administración' },
  { href: '07-estados.html',       texto: '7 · Estados' },
  { href: '08-cifrado.html',       texto: '8 · Cifrado' },
];

(function () {
  // Tema: respeta la preferencia guardada; si no hay, sigue al sistema.
  const guardado = localStorage.getItem('tg-theme');
  if (guardado) document.documentElement.setAttribute('data-theme', guardado);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', 'dark');

  if (localStorage.getItem('tg-notes') === 'off') document.body.classList.add('hide-notes');

  const actual = location.pathname.split('/').pop() || 'index.html';

  const bar = document.createElement('div');
  bar.className = 'proto-bar';
  bar.innerHTML = `
    <span class="logo">Tex<b>Guard</b> <span class="tag">mockups</span></span>
    <nav>${PAGINAS.map(p =>
      `<a href="${p.href}" class="${p.href === actual ? 'active' : ''}">${p.texto}</a>`
    ).join('')}</nav>
    <div class="proto-actions">
      <button class="btn sm" id="tg-notes" type="button">Anotaciones</button>
      <button class="btn sm" id="tg-theme" type="button">Tema</button>
    </div>`;
  document.body.prepend(bar);

  document.getElementById('tg-theme').addEventListener('click', () => {
    const oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
    const nuevo = oscuro ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    localStorage.setItem('tg-theme', nuevo);
  });

  document.getElementById('tg-notes').addEventListener('click', () => {
    const oculto = document.body.classList.toggle('hide-notes');
    localStorage.setItem('tg-notes', oculto ? 'off' : 'on');
  });
})();
