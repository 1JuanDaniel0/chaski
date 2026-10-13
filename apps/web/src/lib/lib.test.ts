import { fileKind } from './filetype';
import { describe, expect, it } from 'vitest';
import { describeDevice } from './device';
import { etaLabel, formatSize } from './format';
import { hasExecutableExtension, sanitizeFilename } from './filename';

const RTLO = String.fromCodePoint(0x202e);
const LRO = String.fromCodePoint(0x202d);
const ZW = String.fromCodePoint(0x200b);

describe('sanitizeFilename', () => {
  it('elimina RTLO y bidi', () => {
    const out = sanitizeFilename(`factura${RTLO}fdp.exe`);
    expect(out).toBe('facturafdp.exe');
    expect(out).not.toContain(RTLO);
    expect(sanitizeFilename(`a${LRO}b${ZW}c.txt`)).toBe('abc.txt');
  });
  it('elimina caracteres de control', () => {
    expect(sanitizeFilename('a\u0000b\u0007c\nd\u007f.txt')).toBe('abcd.txt');
  });
  it('neutraliza recorridos de ruta', () => {
    expect(sanitizeFilename('../../x')).toBe('x');
    expect(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..')).toBe('archivo');
    expect(sanitizeFilename('')).toBe('archivo');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
  });
  it('limita el largo conservando la extensión', () => {
    const out = sanitizeFilename('a'.repeat(500) + '.pdf');
    expect(out.length).toBe(120);
    expect(out.endsWith('.pdf')).toBe(true);
  });
});

describe('extensiones ejecutables', () => {
  it('detecta', () => {
    expect(hasExecutableExtension('setup.EXE')).toBe(true);
    expect(hasExecutableExtension('x.pdf.exe')).toBe(true);
    expect(hasExecutableExtension('foto.jpg')).toBe(false);
    expect(hasExecutableExtension('Makefile')).toBe(false);
  });
});

describe('formatSize', () => {
  it('legible', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('etaLabel', () => {
  it('no muestra horas mientras el envío arranca', () => {
    expect(etaLabel(30, 5)).toBe('30 s');
    expect(etaLabel(300, 5)).toBe('5 min');
    expect(etaLabel(639 * 60, 10)).toBe('tomando velocidad…');
    expect(etaLabel(639 * 60, 300)).toBe('639 min');
  });
});

describe('describeDevice', () => {
  it('UA típicos', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537')).toBe('Android · Chrome');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120')).toBe('Windows · Edge');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Version/17 Safari/604')).toBe('iOS · Safari');
  });
});

describe('fileKind', () => {
  it('usa el mime cuando viene', () => {
    expect(fileKind('video/mp4', 'clip')).toBe('video');
    expect(fileKind('audio/mpeg', 'nota')).toBe('audio');
    expect(fileKind('application/pdf', 'x')).toBe('pdf');
    expect(fileKind('image/png', 'a.png')).toBe('image');
  });
  it('cae a la extensión si el mime está vacío', () => {
    expect(fileKind('', 'VID_2026.MOV')).toBe('video');
    expect(fileKind('', 'informe.docx')).toBe('word');
    expect(fileKind('', 'notas.xlsx')).toBe('excel');
    expect(fileKind('application/octet-stream', 'clase.pptx')).toBe('slides');
    expect(fileKind('', 'Main.java')).toBe('text');
    expect(fileKind('', 'fotos.zip')).toBe('archive');
    expect(fileKind('', 'sin-extension')).toBe('other');
  });
  it('nunca previsualiza SVG', () => {
    expect(fileKind('image/svg+xml', 'logo.svg')).toBe('other');
    expect(fileKind('', 'logo.svg')).toBe('other');
  });
});
