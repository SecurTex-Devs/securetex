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

try {
  await pageA.goto(base);
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await pageA.emulateMedia({ colorScheme });
      await pageA.setViewportSize({ width, height: 900 });
      const scan = await new AxeBuilder({ page: pageA }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(scan.violations.map(v => v.id), [], 'accesibilidad de la portada');
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
