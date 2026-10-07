/** Qué vista previa le toca a un archivo. El mime puede venir vacío, así que también se mira la extensión. */
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'word' | 'excel' | 'slides' | 'archive' | 'other';

const EXT: Record<string, FileKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', heic: 'image', heif: 'image',
  mp4: 'video', m4v: 'video', webm: 'video', mov: 'video', mkv: 'video', '3gp': 'video',
  mp3: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', wav: 'audio', flac: 'audio',
  pdf: 'pdf',
  txt: 'text', md: 'text', csv: 'text', json: 'text', xml: 'text', log: 'text', yml: 'text', yaml: 'text',
  java: 'text', js: 'text', ts: 'text', py: 'text', sql: 'text', c: 'text', cpp: 'text', h: 'text', sh: 'text',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', ods: 'excel',
  ppt: 'slides', pptx: 'slides', odp: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
};

export function fileKind(mime: string, name: string): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  const byExt = ext ? EXT[ext] : undefined;
  // SVG puede llevar scripts: no se previsualiza, se descarga como cualquier archivo.
  if (ext === 'svg') return 'other';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return byExt ?? (mime.startsWith('text/') ? 'text' : 'other');
}
