import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?mode=foot&debug');
await page.waitForTimeout(4000);
await page.keyboard.press('t');
await page.waitForTimeout(1500);
const state = await page.evaluate(() => {
  const w = window.__world;
  return {
    player: { x: w.player.x, z: w.player.z },
    fish: w.fish ? { x: w.fish.x, z: w.fish.z, state: w.fish.state } : null,
    fight: w.tether?.fights?.[0] ?? null,
  };
});
console.log(JSON.stringify(state, null, 1));
await b.close();
