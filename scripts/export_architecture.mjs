import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import path from 'path';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ 
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2 
  });
  
  const absPath = path.resolve('.archify/architecture-epako-runtime-20261025-172733/epako-runtime.html');
  const fileUrl = 'file:///' + absPath.split(path.sep).join('/');
  console.log('Loading:', fileUrl);
  
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Also call export if available, or extract the SVG element
  const svgHandle = await page.$('svg[viewBox="0 0 1500 652"]');
  if (!svgHandle) {
    console.error('Could not find diagram SVG');
    await browser.close();
    return;
  }
  
  console.log('Found diagram SVG!');
  
  // Take clean PNG screenshot of the SVG
  await svgHandle.screenshot({ path: 'architecture.png' });
  console.log('Saved architecture.png (retina 2x)');

  // Also check if we can get the standalone SVG XML with all styles
  const svgXml = await page.evaluate(() => {
    const svg = document.querySelector('svg[viewBox="0 0 1500 652"]');
    if (!svg) return null;
    
    // Check if cleanExportClone exists in window/scope or clone directly
    const clone = svg.cloneNode(true);
    
    // Find all style elements in document and embed into SVG defs
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = styles;
    
    const defs = clone.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.prepend(styleEl);
    if (!clone.querySelector('defs')) {
      clone.prepend(defs);
    }
    
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '1500');
    clone.setAttribute('height', '652');
    
    return new XMLSerializer().serializeToString(clone);
  });
  
  if (svgXml) {
    fs.writeFileSync('architecture.svg', svgXml, 'utf-8');
    console.log('Saved architecture.svg (' + svgXml.length + ' bytes)');
  }
  
  await browser.close();
}

main().catch(console.error);
