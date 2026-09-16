require('dotenv/config');
const { chromium, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const { resolve } = require('path');
const fs = require('fs');
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForSelector('.product');
  await page.screenshot({ path: '.local/ui-desktop.png', fullPage: true });
  if ((await page.locator('.product').count()) !== 3) throw Error('Catálogo incompleto');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: '¿Primera vez? Crea tu cuenta' }).click();
  await page.getByLabel('Nombres', { exact: true }).fill('Prueba');
  await page.getByLabel('Apellidos', { exact: true }).fill('Navegador');
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('navegador-' + Date.now() + '@grupo18.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('PruebaNavegador2026!');
  const registered = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  const identity = await (await registered).json();
  await page.waitForSelector('.auth-modal', { state: 'detached' });
  await page.getByRole('button', { name: 'Mi avatar', exact: true }).click();
  await page.waitForSelector('.capture-form');
  await page.screenshot({ path: '.local/ui-avatar.png', fullPage: true });
  // Fixture owned by this new QA account, copied from the labelled reference.
  // This exercises private display/approval/fitting, not photo reconstruction.
  const db = new PrismaClient();
  const avatarId = randomUUID();
  const key = 'private/qa/' + avatarId + '.glb';
  fs.mkdirSync(resolve('.local/storage/private/qa'), { recursive: true });
  fs.copyFileSync(resolve('.local/storage/public/reference.glb'), resolve('.local/storage', key));
  const template = await db.plantilla_corporal.findFirstOrThrow();
  await db.avatar.create({
    data: {
      id: avatarId,
      usuario_id: identity.user.id,
      plantilla_id: template.id,
      version: 1,
      estado: 'EN_REVISION',
      clave_glb: key,
      medidas: { altura: { valor_cm: 170 } },
      parametros_malla: { height: 1.7, qa_fixture: true },
      creado_en: new Date(),
    },
  });
  await db.$disconnect();
  await page.getByRole('button', { name: /Versión 1 EN REVISION/ }).click();
  await expect(page.locator('.viewer-status')).toHaveCount(0, { timeout: 20000 });
  await page.getByRole('button', { name: 'Aprobar este avatar' }).click();
  await page.getByRole('button', { name: 'Colección', exact: true }).click();
  await page
    .locator('.product')
    .nth(0)
    .getByRole('button', { name: 'Probar en 3D', exact: true })
    .click();
  await expect(page.locator('.message').filter({ hasText: 'Prenda cargada' })).toBeVisible();
  await expect(page.locator('.viewer-status')).toHaveCount(0, { timeout: 20000 });
  await page
    .locator('.product')
    .nth(1)
    .getByRole('button', { name: 'Probar en 3D', exact: true })
    .click();
  await expect(
    page.locator('.product').nth(1).getByRole('button', { name: 'Probar en 3D', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.viewer-status')).toHaveCount(0, { timeout: 20000 });
  await page.screenshot({ path: '.local/ui-fitting.png', fullPage: true });
  await page.getByRole('button', { name: 'Mi avatar', exact: true }).click();
  let allowDelete, deleteArrived;
  const deleting = new Promise((resolve) => {
    deleteArrived = resolve;
  });
  await page.route('**/api/avatars/' + avatarId, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue();
      return;
    }
    deleteArrived();
    await new Promise((resolve) => {
      allowDelete = resolve;
    });
    await route.continue();
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Eliminar avatar versión 1' }).click();
  await deleting;
  try {
    expect(await page.getByRole('button', { name: /Versión 1 APROBADO/ }).isDisabled()).toBe(true);
  } finally {
    allowDelete();
  }

  await expect(page.locator('.avatar-item')).toHaveCount(0, { timeout: 15000 });
  const lateId = randomUUID(),
    lateKey = 'private/qa/' + lateId + '.glb';
  fs.copyFileSync(
    resolve('.local/storage/public/reference.glb'),
    resolve('.local/storage', lateKey),
  );
  await db.avatar.create({
    data: {
      id: lateId,
      usuario_id: identity.user.id,
      plantilla_id: template.id,
      version: 2,
      estado: 'EN_REVISION',
      clave_glb: lateKey,
      medidas: { altura: { valor_cm: 170 } },
      parametros_malla: { qa_fixture: true },
      creado_en: new Date(),
    },
  });
  let release;
  let intercepted;
  const gate = new Promise((resolve) => {
    intercepted = resolve;
  });
  await page.route('**/api/avatars/' + lateId + '/model', async (route) => {
    const response = await route.fetch();
    intercepted();
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /Versión 2 EN REVISION/ }).click();
  await gate;
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  const delivered = page.waitForResponse((r) => r.url().includes('/avatars/' + lateId + '/model'));
  release();
  await delivered;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  try {
    await expect(page.getByText('Tu avatar personal', { exact: true })).toHaveCount(0);
  } finally {
    await db.avatar.update({ where: { id: lateId }, data: { estado: 'ELIMINANDO' } });
    await db.$disconnect();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Colección', exact: true }).click();
  await page.screenshot({ path: '.local/ui-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw Error('Desbordamiento horizontal en móvil');
  if (errors.length) throw Error(errors.join('\n'));
  fs.writeFileSync(
    '.local/ui-result.json',
    JSON.stringify(
      {
        catalog: 3,
        registration: true,
        avatarForm: true,
        privateViewer: true,
        approval: true,
        garmentChange: true,
        deletion: true,
        mobileOverflow: false,
        logoutDuringLoad: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Navegador: catálogo, registro, captura, avatar privado de prueba, aprobación, cambio de prenda, borrado y móvil verificados.',
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
