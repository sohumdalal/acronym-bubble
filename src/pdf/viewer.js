// Acronym Bubble's PDF viewer. Chrome's own PDF viewer runs no content
// scripts, so the background worker sends PDFs here instead. PDF.js
// (pdfjs-dist 4.10.38, Apache-2.0) draws each page and lays its text over
// it as real, transparent text. The extension's own scripts, loaded by
// viewer.html, then underline and explain acronyms in that text as on any
// page: the text layer is "late text" to them, added as pages render.
import './pdfjs-global.js';
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';

const lib = globalThis.pdfjsLib;
const asset = (p) => chrome.runtime.getURL(`dist/${p}`);
lib.GlobalWorkerOptions.workerSrc = asset('pdf.worker.mjs');

const file = new URLSearchParams(location.search).get('file') || '';
const $ = (id) => document.getElementById(id);
const MIN = 0.25;
const MAX = 5;

// Chrome's own viewer, for this one load: the background worker lets the
// next request for this URL through.
async function openOriginal(e) {
  e.preventDefault();
  await chrome.runtime.sendMessage({ type: 'pdf-bypass', url: file }).catch(() => {});
  location.href = file;
}
$('original').href = file;
$('fallback').href = file;
$('original').addEventListener('click', openOriginal);
$('fallback').addEventListener('click', openOriginal);

function fail(why) {
  $('viewerContainer').hidden = true;
  $('why').textContent = why;
  $('error').hidden = false;
}

const fileName = () => {
  try {
    return decodeURIComponent(new URL(file).pathname.split('/').pop()) || new URL(file).hostname;
  } catch {
    return 'PDF';
  }
};

async function main() {
  if (!/^(https?|file):/.test(file)) return fail('There is no PDF to open.');
  $('name').textContent = document.title = fileName();

  const container = $('viewerContainer');
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1 });
  linkService.setViewer(viewer);

  eventBus.on('pagesinit', () => (viewer.currentScaleValue = 'auto'));
  eventBus.on('scalechanging', (e) => ($('scale').textContent = `${Math.round(e.scale * 100)}%`));
  eventBus.on('pagechanging', (e) => ($('pages').textContent = `${e.pageNumber} / ${viewer.pagesCount}`));
  const zoom = (by) => (viewer.currentScale = Math.min(MAX, Math.max(MIN, viewer.currentScale * by)));
  $('in').addEventListener('click', () => zoom(1.1));
  $('out').addEventListener('click', () => zoom(1 / 1.1));

  let doc;
  try {
    doc = await lib.getDocument({
      url: file,
      withCredentials: true,
      cMapUrl: asset('pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: asset('pdfjs/standard_fonts/'),
      isEvalSupported: false,
    }).promise;
  } catch (err) {
    console.warn('[Acronym Bubble] the PDF did not load:', err);
    return fail(`This PDF did not open here (${err.message || err.name}).`);
  }
  viewer.setDocument(doc);
  linkService.setDocument(doc);
  $('pages').textContent = `1 / ${doc.numPages}`;
  const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
  if (info && info.Title && info.Title.trim()) $('name').textContent = document.title = info.Title.trim();
}

main();
