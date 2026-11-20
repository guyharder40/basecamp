// Shareable trophy cards + Season Recap cards — 1080×1350 PNG, drawn fresh
// from the post each time with <canvas>. Nothing new is stored.
// Trophy card: whole photo uncropped over its own blurred darkened backdrop,
// near-black green ground, vignette, double frame, big display-type animal
// title, hunter/date/camp below, comment as a quote beside an orange rule,
// gradient-orange Basecamp branding, "Hunt together. Share the story." band.

export interface TrophyCardInput {
  imageUrl: string; // may be a data URL or a placeholder (no real file)
  animal: string; hunter: string; date: string; place: string; comment: string;
}
export interface RecapCardInput {
  name: string; season: string; state: string;
  photoUrls: string[];
  stats: { label: string; value: string }[]; // six stat tiles
  speciesLine: string; highlightLines: string[]; badges: string[];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!src || src.startsWith('./blobs/')) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function drawBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, W: number, H: number) {
  // Near-black green ground
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1f16'); g.addColorStop(0.6, '#0a1710'); g.addColorStop(1, '#071009');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (img) {
    ctx.save();
    (ctx as any).filter = 'blur(28px) brightness(0.45) saturate(1.1)';
    const scale = Math.max(W / img.width, H / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.restore();
  }
  // Vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function drawDoubleFrame(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.strokeStyle = 'rgba(194,112,46,0.9)'; ctx.lineWidth = 4;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);
}
function drawBrandTop(ctx: CanvasRenderingContext2D, W: number) {
  const grad = ctx.createLinearGradient(60, 0, W - 60, 0);
  grad.addColorStop(0, '#f7b267'); grad.addColorStop(0.5, '#c2702e'); grad.addColorStop(1, '#e07a3f');
  ctx.fillStyle = grad;
  ctx.font = '800 54px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('BASECAMP', 70, 108);
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillStyle = '#f7b267';
  ctx.fillText('T R O P H Y   C A R D', 70, 146);
}
function drawBottomBand(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const grad = ctx.createLinearGradient(0, H - 110, W, H - 110);
  grad.addColorStop(0, '#c2702e'); grad.addColorStop(1, '#e07a3f');
  ctx.fillStyle = grad;
  ctx.fillRect(40, H - 118, W - 80, 78);
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hunt together. Share the story.', W / 2, H - 68);
}
function drawPhotoUncropped(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, fallbackLabel: string) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#12291d'; ctx.fillRect(x, y, w, h);
  if (img) {
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#2d5a45';
    ctx.font = '700 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f7b267';
    ctx.fillText(fallbackLabel, x + w / 2, y + h / 2);
    ctx.font = '400 24px system-ui, sans-serif'; ctx.fillStyle = '#ffffffaa';
    ctx.fillText('Photo needs re-upload', x + w / 2, y + h / 2 + 40);
  }
  ctx.restore();
}

export async function buildTrophyCard(input: TrophyCardInput): Promise<string> {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = await loadImage(input.imageUrl);
  drawBackdrop(ctx, img, W, H);
  drawBrandTop(ctx, W);
  // Photo area: whole image uncropped, centred
  drawPhotoUncropped(ctx, img, 70, 180, W - 140, 640, input.animal || 'Trophy');
  // Animal in big display type across the photo's foot
  ctx.textAlign = 'left';
  ctx.font = '800 84px Georgia, serif';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  const animalLines = wrapText(ctx, (input.animal || 'Trophy').toUpperCase(), W - 160);
  let ty = 880;
  for (const line of animalLines.slice(0, 2)) { ctx.fillText(line, 70, ty); ty += 88; }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillStyle = '#f7b267';
  ctx.fillText(`${input.hunter}  ·  ${input.date}`, 70, ty + 6);
  ctx.fillStyle = '#ffffffcc';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText(input.place, 70, ty + 44);
  // Comment as a quote beside an orange rule
  if (input.comment) {
    const qy = ty + 110;
    ctx.fillStyle = '#c2702e';
    ctx.fillRect(70, qy, 6, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 400 30px Georgia, serif';
    const lines = wrapText(ctx, `“${input.comment}”`, W - 220);
    let ly = qy + 34;
    for (const line of lines.slice(0, 3)) { ctx.fillText(line, 96, ly); ly += 40; }
  }
  drawDoubleFrame(ctx, W, H);
  drawBottomBand(ctx, W, H);
  return canvas.toDataURL('image/png');
}

export async function buildRecapCard(input: RecapCardInput): Promise<string> {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const imgs: (HTMLImageElement | null)[] = [];
  for (const u of input.photoUrls.slice(0, 4)) imgs.push(await loadImage(u));
  drawBackdrop(ctx, imgs[0] ?? null, W, H);
  drawBrandTop(ctx, W);
  ctx.fillStyle = '#f7b267';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText('S E A S O N   R E C A P', 70, 146);
  // Name + season
  ctx.fillStyle = '#fff';
  ctx.font = '800 64px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(input.name, 70, 230);
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillStyle = '#f7b267';
  ctx.fillText(`${input.season} season  ·  ${input.state}`, 70, 274);
  // Photo strip (up to 4)
  const shown = imgs.filter(Boolean) as HTMLImageElement[];
  const pw = shown.length ? (W - 140 - (shown.length - 1) * 12) / shown.length : 0;
  shown.forEach((im, i) => {
    drawPhotoUncropped(ctx, im, 70 + i * (pw + 12), 300, pw, 260, '');
  });
  // Six stat tiles
  const tiles = input.stats.slice(0, 6);
  const tw = (W - 140 - 24) / 3, th = 150;
  tiles.forEach((t, i) => {
    const x = 70 + (i % 3) * (tw + 12), y = 600 + Math.floor(i / 3) * (th + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y, tw, th, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(194,112,46,0.7)'; ctx.lineWidth = 2;
    roundRect(ctx, x, y, tw, th, 16); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 52px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText(t.value, x + tw / 2, y + 74);
    ctx.fillStyle = '#f7b267'; ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(t.label.toUpperCase(), x + tw / 2, y + 112);
  });
  // Species + highlights
  let ly = 960;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = '600 30px system-ui, sans-serif';
  if (input.speciesLine) { ctx.fillText(input.speciesLine, 70, ly); ly += 44; }
  ctx.fillStyle = '#ffffffcc'; ctx.font = '400 28px system-ui, sans-serif';
  for (const line of input.highlightLines.slice(0, 2)) { ctx.fillText(line, 70, ly); ly += 40; }
  if (input.badges.length) {
    ctx.fillStyle = '#f7b267'; ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillText(`Badges earned: ${input.badges.join(' · ')}`, 70, ly + 8);
  }
  drawDoubleFrame(ctx, W, H);
  drawBottomBand(ctx, W, H);
  return canvas.toDataURL('image/png');
}

export function downloadPng(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export async function sharePng(dataUrl: string, filename: string, title: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch { /* sharing not supported or cancelled */ }
  return false;
}
