import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect } from '@playwright/test';
import { verifiedUser } from '../../backend/apps/api/test/security/helpers.mjs';

const base = process.env.REVIEW_URL ?? 'http://localhost:3000';
const output = new URL('./artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const expect = baseExpect.configure({ timeout: 45_000 });
const checks = [];
const report = (check) => { checks.push(check); console.log(`OK: ${check}`); };
const a = await chromium.launch();
const b = await firefox.launch();
const contextA = await a.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
const contextB = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const screenshot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(name, output)) });
async function appearanceReady(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}
async function pdfReady(page) {
  await expect(page.getByText('PDF firmado · Ed25519', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Recompilar', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 64) if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150 && data[i + 3] > 0) ink++;
    return ink > 100;
  }));
}
async function enter(page) {
  await page.goto(base);
  await page.locator('main').getByRole('button', { name: 'Probar la demo', exact: true }).first().click();
  await page.waitForURL('**/proyecto/*');
  await expect(page.getByText('Demo compartida.', { exact: false })).toBeVisible();
}

async function reviewLanding(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ver el código', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Proyecto académico · SecurTex-Devs', exact: true })).toHaveAttribute('href', 'https://github.com/SecurTex-Devs/securetex');
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await page.getByRole('button', { name: 'Reproducir recorrido', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar recorrido', exact: true }).click();
  const tabs = page.getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1);
  await page.getByRole('link', { name: /Art[ií]culo de conferencia/ }).click();
  await page.waitForURL('**/plantillas/articulo');
  await expect(page.getByRole('button', { name: 'Usar plantilla', exact: true })).toBeVisible();
  await page.goto(base);
  report('Recorrido público con vídeo controlable, pestañas por teclado y acceso a plantillas reales');
}

async function reviewHeaders() {
  const response = await fetch(base);
  const html = await response.text();
  const asset = html.match(/src="(\/_next\/static\/[^"?]+\.js)/)?.[1];
  assert.ok(asset, 'recurso real del build');
  const staticResponse = await fetch(base + asset);
  const redirect = await fetch(base + '/proyectos', { redirect: 'manual' });
  for (const item of [response, staticResponse, redirect]) {
    assert.equal(item.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(item.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(item.headers.get('cross-origin-embedder-policy'), 'credentialless');
    assert.ok(item.headers.get('strict-transport-security')?.includes('max-age=63072000'));
    assert.ok(item.headers.get('permissions-policy')?.includes('camera=()'));
  }
  assert.equal(redirect.status, 307);
  assert.ok(redirect.headers.get('content-type')?.includes('text/plain'));
  assert.ok(staticResponse.headers.get('cache-control')?.includes('immutable'));
  for (const path of ['/api/v1', '/_next/static']) {
    const missing = await fetch(base + path);
    assert.equal(missing.status, 404);
    assert.ok(missing.headers.get('content-security-policy')?.includes("default-src 'none'"));
  }
  const verification = await fetch(base + '/verificar');
  assert.equal(verification.headers.get('referrer-policy'), 'no-referrer');
  const options = await fetch(base + '/api/v1/crypto/transport-key', { method: 'OPTIONS' });
  assert.ok([404, 405].includes(options.status));
  assert.equal(options.headers.get('allow')?.includes('DELETE') ?? false, false);
  const excludedImage = await fetch(base + '/_next/image?url=%2Fapi%2Fv1%2Fhealth&w=828&q=75');
  assert.equal(excludedImage.status, 400);
  assert.ok((await excludedImage.text()).includes('not allowed'));
  report('Cabeceras de seguridad en HTML, estáticos y redirecciones; caché pública y retorno privado conservados');
}

async function reviewLegalPages(page) {
  for (const [path, title] of [['/privacidad', 'Política de privacidad'], ['/terminos', 'Condiciones de uso']]) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200, 'información pública sin iniciar sesión');
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    assert.ok(await page.locator('article').innerText().then(text => text.length > 1500), 'contenido completo, no una página vacía');
    for (const colorScheme of ['light', 'dark']) {
      for (const width of [1440, 390]) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
        await appearanceReady(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        assert.deepEqual(scan.violations.map(item => item.id), []);
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 900 });
  report('Privacidad y condiciones públicas, con contenido y accesibles en cuatro variantes cada una');
}

try {
  await reviewHeaders();
  await reviewLegalPages(pageA);
  await pageA.goto(base);
  await reviewLanding(pageA);
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await pageA.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await pageA.setViewportSize({ width, height: 900 });
      await pageA.reload();
      await expect(pageA.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await appearanceReady(pageA);
      const scan = await new AxeBuilder({ page: pageA }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => ({ target: node.target, reason: node.failureSummary })) })), [], `accesibilidad de la portada ${width}px ${colorScheme}`);
    }
  }
  await pageA.emulateMedia({ colorScheme: 'light' });
  await pageA.setViewportSize({ width: 1440, height: 900 });
  report('Portada accesible con axe en móvil y escritorio, claro y oscuro');
  await screenshot(pageA, 'landing-clara.png');
  const started = performance.now();
  await pageA.locator('main').getByRole('button', { name: 'Probar la demo', exact: true }).first().click();
  await pageA.waitForURL('**/proyecto/*');
  await pdfReady(pageA);
  const openedMs = Math.round(performance.now() - started);
  report('Demo abierta desde la portada sin formulario de acceso');
  report(`Documento de ejemplo compilado y visible en ${openedMs} ms`);
  await screenshot(pageA, 'editor-claro.png');
  const meA = await (await pageA.request.get(`${base}/api/v1/me`)).json();
  await enter(pageB);
  await pdfReady(pageB);
  const meB = await (await pageB.request.get(`${base}/api/v1/me`)).json();
  assert.equal(meA.isDemo, true);
  assert.equal(meB.isDemo, true);
  assert.equal(meA.isSystemAdmin, false);
  assert.equal(meB.isSystemAdmin, false);
  assert.equal(pageA.url(), pageB.url());
  report('Chromium y Firefox acceden al mismo documento con sesiones independientes');
  await screenshot(pageB, 'editor-oscuro.png');

  const editorA = pageA.getByRole('textbox', { name: 'Editor de código de main.tex', exact: true });
  const editorB = pageB.getByRole('textbox', { name: 'Editor de código de main.tex', exact: true });
  await editorA.press('Control+Home');
  await pageA.keyboard.insertText('% Cambio compartido desde Chromium\n');
  await expect(editorB).toContainText('Cambio compartido desde Chromium');
  await editorB.press('Control+Home');
  await pageB.keyboard.insertText('% Respuesta desde Firefox\n');
  await expect(editorA).toContainText('Respuesta desde Firefox');
  report('Los cambios de la demo se sincronizan en ambas direcciones');
  await screenshot(pageA, 'colaboracion.png');
  await pageA.getByRole('button', { name: 'Recompilar', exact: true }).click();
  await pdfReady(pageA);
  const pending = pageA.waitForEvent('download');
  await pageA.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const download = await pending;
  const path = fileURLToPath(new URL('curriculum.pdf', output));
  await download.saveAs(path);
  const pdf = await readFile(path);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  report(`PDF verificado y descargado (${pdf.length} bytes)`);

  await pageA.setViewportSize({ width: 390, height: 844 });
  const overflow = await pageA.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'el editor no debe desbordar la pantalla móvil');
  await expect(pageA.getByRole('button', { name: 'Recompilar', exact: true })).toBeVisible();
  await pageA.locator('button[aria-label="Vista previa"]').click();
  const downloadBox = await pageA.getByRole('button', { name: 'Descargar PDF', exact: true }).boundingBox();
  assert.ok(downloadBox && downloadBox.x >= 0 && downloadBox.x + downloadBox.width <= 390, 'la descarga debe caber en el viewport móvil antes de desplazar o pulsar');
  await screenshot(pageA, 'editor-movil.png');
  await pageA.getByRole('link', { name: 'Volver a mis proyectos', exact: true }).click();
  await pageA.waitForURL(base + '/');
  assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot(pageA, 'landing-movil.png');
  report('Portada y editor a 390 px sin desbordamiento');
  if (base === 'http://localhost:3000') {
    const normal = await verifiedUser('transicion-ui');
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await pageA.getByRole('link', { name: 'Iniciar sesión', exact: true }).first().click();
    await pageA.getByLabel('Correo', { exact: true }).fill(normal.email);
    await pageA.getByLabel('Contraseña', { exact: true }).fill(normal.password);
    await pageA.getByRole('button', { name: 'Entrar', exact: true }).click();
    await pageA.waitForURL('**/proyectos');
    await pageA.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click();
    await pageA.getByLabel('Nombre del proyecto', { exact: true }).fill('Cuenta normal después de la demo');
    await pageA.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
    await pageA.waitForURL('**/proyecto/*');
    await expect(pageA.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
    await pageA.getByRole('button', { name: 'Opciones de compilación', exact: true }).click();
    await expect(pageA.getByRole('switch', { name: 'Autocompilación', exact: true })).toBeChecked();
    report('La cuenta normal recupera creación de proyectos, compartir y autocompilación al salir de la demo');
  }
  await writeFile(new URL('resultados.json', output), JSON.stringify({ production: base.startsWith('https:'), checks, openedMs, browsers: [a.version(), b.version()] }, null, 2));
} catch (error) {
  await screenshot(pageA, 'fallo.png').catch(() => {});
  await screenshot(pageB, 'fallo-firefox.png').catch(() => {});
  console.error(error.message); console.error('Firefox:', pageB.url(), await pageB.getByRole('alert').allTextContents());
  process.exitCode = 1;
} finally { await a.close(); await b.close(); }
