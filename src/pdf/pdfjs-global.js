// PDF.js's viewer components read the library from globalThis.pdfjsLib when
// they load, so it is set in a module of its own, imported first.
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

globalThis.pdfjsLib = pdfjsLib;
