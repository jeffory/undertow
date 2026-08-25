import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?debug');
await page.waitForTimeout(4000);
await page.keyboard.down('w');
await page.waitForTimeout(3000);
await page.keyboard.up('w');
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const w = window.__world;
  const scene = window.__scene;
  const out = { boat: { x: +w.boat.x.toFixed(1), z: +w.boat.z.toFixed(1) }, points: [], sprites: [] };
  if (!scene) return { ...out, note: 'no scene' };
  const v = { x: 0, y: 0, z: 0 };
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.type === 'Points') {
      const e = o.matrixWorld.elements;
      out.points.push({
        name: o.name || (o.parent && o.parent.name) || '?',
        wx: +e[12].toFixed(1), wy: +e[13].toFixed(1), wz: +e[14].toFixed(1),
        visible: o.visible,
        count: o.geometry.attributes.position.count,
        matSize: o.material.size, atten: o.material.sizeAttenuation,
      });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'squares-repro.png' });
await b.close();
