// Graba la escena cuadro por cuadro con Playwright (WebGL por software). Ver main.js.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const q = process.argv[2] || '';
  const dir = 'frames' + q.replace(/\W/g, '');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto('http://localhost:5199/?still&w=1200' + q);
  await p.waitForFunction(() => window.ready);
  for (let i = 0; i < 300; i++) {
    await p.evaluate((t) => window.frame(t), i / 30);
    await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` });
  }
  await b.close();
})();
