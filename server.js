const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const linksFile = path.join(__dirname, 'data', 'telegram-links.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function sendFile(res, requestedPath) {
  const safePath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function readLinks() {
  const raw = await fs.readFile(linksFile, 'utf-8');
  return JSON.parse(raw);
}

async function writeLinks(links) {
  await fs.writeFile(linksFile, JSON.stringify(links, null, 2), 'utf-8');
}

function normalizeTelegramUrl(url) {
  const parsed = new URL(url);
  if (!['t.me', 'telegram.me'].includes(parsed.hostname)) {
    throw new Error('Поддерживаются только ссылки на t.me');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] !== 's') {
    parsed.pathname = `/s/${parts[0]}`;
  }

  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function getTelegramParts(sourceUrl) {
  const parsed = new URL(sourceUrl);
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (parts[0] === 's') {
    return { channel: parts[1] || '', postId: parts[2] || '' };
  }

  return { channel: parts[0] || '', postId: parts[1] || '' };
}

async function fetchTelegramHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CarCatalogBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить пост: ${response.status}`);
  }

  return response.text();
}

async function loadTelegramPost(url) {
  const sourceHtml = await fetchTelegramHtml(url);
  const parsed = parseTelegramHtml(sourceHtml, url);
  const albumPhotos = await collectRangeAlbumPhotos(url, sourceHtml);

  if (albumPhotos.length) {
    parsed.photos = albumPhotos.slice(0, 10);
  }

  return parsed;
}

function parseTelegramHtml(html, sourceUrl) {
  const entries = extractMessageEntries(html);
  const targetIndex = findTargetEntryIndex(entries, sourceUrl);
  const targetEntry = entries[targetIndex] || { html };

  const cleanText = extractPostText(targetEntry.html || html);
  const structuredText = extractStructuredSnippet(cleanText);
  const photos = extractAlbumPhotoUrls(entries, targetIndex, html).slice(0, 10);

  const title =
    find(structuredText, /🔥\s*([^🔥\n]+?)\s*🔥/i) ||
    find(structuredText, /^([A-Za-zА-Яа-я0-9\- ]{3,60})/i) ||
    'Unknown model';

  const year = Number(find(structuredText, /Год\s*[:]?\s*(\d{4})/i)) || null;
  const mileage = toNumber(find(structuredText, /Пробег[^\d]*(\d[\d\s\u00A0]{2,})\s*км/i));
  const horsepower = toNumber(find(structuredText, /(\d{2,4})\s*л\.?\s*с\.?/i));
  const bodyType = detectBodyType(structuredText);
  const fuelType = detectFuelType(structuredText);
  const drive = find(structuredText, /Привод\s*[:]?\s*([^\n]+)/i) || '';
  const transmission = find(structuredText, /Коробка\s*[:]?\s*([^\n]+)/i) || '';
  const engine = find(structuredText, /Двигатель\s*[:]?\s*([^\n]+)/i) || '';

  const normalizedTitle = title.replace(/\s+/g, ' ').trim();
  const [brand = 'Unknown', ...modelParts] = normalizedTitle.replace(/\//g, ' / ').split(/\s+/);

  return {
    id: hashCode(sourceUrl),
    sourceUrl,
    brand,
    model: modelParts.join(' ').trim() || normalizedTitle,
    year,
    price: null,
    currency: 'EUR',
    fuelType: fuelType || engine || 'Не указано',
    horsepower,
    bodyType,
    mileage,
    drive: drive.trim(),
    transmission: transmission.trim(),
    engine: engine.trim(),
    status: 'On the Lithuania-Belarus border',
    description: structuredText || cleanText,
    photos,
  };
}

function findTargetEntryIndex(entries, sourceUrl) {
  if (!entries.length) return -1;

  const { channel, postId } = getTelegramParts(sourceUrl);
  if (!postId) return 0;

  const postKey = `${channel}/${postId}`;
  const exact = entries.findIndex((entry) => entry.dataPost === postKey);
  if (exact >= 0) return exact;

  // Fallback for normalized or partial post ids.
  const byPostId = entries.findIndex((entry) => entry.postId === postId);
  return byPostId >= 0 ? byPostId : 0;
}

function extractMessageEntries(html) {
  const entries = [];
  const articleRegex = /<article[^>]*class="[^"]*tgme_widget_message_wrap[^"]*"[^>]*>[\s\S]*?<\/article>/gim;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const articleHtml = match[0];
    const dataPost = find(articleHtml, /data-post="([^"]+)"/i) || '';
    const datetime = find(articleHtml, /<time[^>]*datetime="([^"]+)"/i) || '';
    const postId = dataPost.split('/')[1] || '';
    const photos = extractPhotoUrls(articleHtml);

    entries.push({
      html: articleHtml,
      dataPost,
      postId,
      datetime,
      photos,
    });
  }

  return entries;
}

function extractAlbumPhotoUrls(entries, targetIndex, fullHtml) {
  if (!entries.length || targetIndex < 0 || !entries[targetIndex]) {
    return extractPhotoUrls(fullHtml);
  }

  const target = entries[targetIndex];
  const targetDateTimeKey = normalizeDateTimeKey(target.datetime);
  const targetPostId = getNumericPostId(target.postId);
  const urls = new Set();

  if (targetPostId) {
    // User-required rule: collect from current post id to +9 ids
    // only when publication date+time key matches the original post.
    const byPostId = new Map(entries.map((entry) => [getNumericPostId(entry.postId), entry]));

    for (let postId = targetPostId; postId <= targetPostId + 9; postId += 1) {
      const entry = byPostId.get(postId);
      if (!entry) continue;

      const entryDateTimeKey = normalizeDateTimeKey(entry.datetime);
      if (targetDateTimeKey && entryDateTimeKey !== targetDateTimeKey) {
        continue;
      }

      entry.photos.forEach((photoUrl) => urls.add(photoUrl));
    }
  } else {
    // Fallback for non-numeric ids: sequential forward scan.
    const maxForwardEntries = 10;
    for (let offset = 0; offset < maxForwardEntries; offset += 1) {
      const entry = entries[targetIndex + offset];
      if (!entry) break;

      const entryDateTimeKey = normalizeDateTimeKey(entry.datetime);
      if (offset > 0 && targetDateTimeKey && entryDateTimeKey !== targetDateTimeKey) {
        break;
      }

      entry.photos.forEach((photoUrl) => urls.add(photoUrl));
    }
  }

  if (!urls.size) {
    return extractPhotoUrls(target.html || fullHtml);
  }

  return [...urls];
}


function getNumericPostId(postId) {
  const value = Number(postId);
  return Number.isInteger(value) && value > 0 ? value : null;
}
async function collectRangeAlbumPhotos(sourceUrl, sourceHtml) {
  const { channel, postId } = getTelegramParts(sourceUrl);
  const startPostId = getNumericPostId(postId);

  if (!channel || !startPostId) {
    return extractPhotoUrls(sourceHtml).slice(0, 10);
  }

  const sourceDateTime = extractTargetDateTime(sourceHtml, sourceUrl);
  const sourceDateKey = normalizeDateTimeKey(sourceDateTime);
  const urls = new Set();

  for (let id = startPostId; id <= startPostId + 9; id += 1) {
    const candidateUrl = `https://t.me/s/${channel}/${id}`;

    try {
      const candidateHtml = id === startPostId ? sourceHtml : await fetchTelegramHtml(candidateUrl);
      const candidateDateTime = extractTargetDateTime(candidateHtml, candidateUrl);
      const candidateDateKey = normalizeDateTimeKey(candidateDateTime);

      if (sourceDateKey && candidateDateKey && sourceDateKey !== candidateDateKey) {
        continue;
      }

      extractTargetPhotos(candidateHtml, candidateUrl).forEach((photoUrl) => urls.add(photoUrl));
    } catch {
      // Ignore missing / inaccessible posts in the requested range.
    }
  }

  return [...urls].slice(0, 10);
}

function extractTargetDateTime(html, sourceUrl) {
  const entries = extractMessageEntries(html);
  const index = findTargetEntryIndex(entries, sourceUrl);

  if (index >= 0 && entries[index]) {
    return entries[index].datetime;
  }

  return find(html, /<time[^>]*datetime="([^"]+)"/i) || '';
}

function extractTargetPhotos(html, sourceUrl) {
  const entries = extractMessageEntries(html);
  const index = findTargetEntryIndex(entries, sourceUrl);

  if (index >= 0 && entries[index]) {
    return entries[index].photos;
  }

  return extractPhotoUrls(html);
}

function normalizeDateTimeKey(value) {
  if (!value) return '';
  // Compare exact minute to bind "same date and time" posts/groups.
  return String(value).slice(0, 16);
}

function extractStructuredSnippet(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return text;

  const stopPattern = /^(🇷🇺|📱|Telegram:|Доставка|Цена\s|💥|🔍)/i;
  const requiredPattern = /(🔥|Год|Пробег|Двигатель|л\.\s*с|Привод|Коробка)/i;

  const result = [];
  for (const line of lines) {
    if (stopPattern.test(line) && result.length) break;
    result.push(line);
  }

  const meaningful = result.filter((line) => requiredPattern.test(line));
  return (meaningful.length ? result : lines).join('\n').trim();
}

function extractPostText(html) {
  const candidates = [
    extractMetaContent(html, 'og:description'),
    extractMetaNameContent(html, 'description'),
    ...extractAllMessageTextBlocks(html),
  ]
    .map((value) => decodeHtml(stripTags(value || '')))
    .map((value) =>
      value
        .replace(/\u00A0/g, ' ')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim(),
    )
    .filter(Boolean);

  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}

function extractAllMessageTextBlocks(html) {
  const blocks = [];
  const regex = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gim;
  let match;

  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMetaContent(html, property) {
  const escaped = escapeRegex(property);
  return (
    find(html, new RegExp(`<meta[^>]*property="${escaped}"[^>]*content="([^"]*)"`, 'i')) ||
    find(html, new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${escaped}"`, 'i')) ||
    ''
  );
}

function extractMetaNameContent(html, name) {
  const escaped = escapeRegex(name);
  return (
    find(html, new RegExp(`<meta[^>]*name="${escaped}"[^>]*content="([^"]*)"`, 'i')) ||
    find(html, new RegExp(`<meta[^>]*content="([^"]*)"[^>]*name="${escaped}"`, 'i')) ||
    ''
  );
}

function stripTags(input) {
  return input.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
}

function decodeHtml(input) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
  };

  return input.replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, (entity) => entities[entity] || entity);
}

function extractPhotoUrls(html) {
  const urls = new Set();
  const styleRegex = /background-image:url\('([^']+)'\)/g;
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    urls.add(match[1].replace(/\\/g, ''));
  }

  const ogImage = find(html, /<meta property="og:image" content="([^"]+)"/i);
  if (ogImage) urls.add(ogImage);

  return [...urls];
}

function find(text, regex) {
  return text.match(regex)?.[1]?.trim();
}

function toNumber(value) {
  if (!value) return null;
  return Number(String(value).replace(/\s+/g, '').replace(',', '.'));
}

function detectFuelType(text) {
  if (/дизел/i.test(text)) return 'Diesel';
  if (/бензин/i.test(text)) return 'Petrol';
  if (/гибрид/i.test(text)) return 'Hybrid';
  if (/электро/i.test(text)) return 'Electric';
  return '';
}

function detectBodyType(text) {
  if (/suv|кроссовер/i.test(text)) return 'SUV';
  if (/седан/i.test(text)) return 'Sedan';
  if (/универсал/i.test(text)) return 'Station wagon';
  if (/хэтчбек/i.test(text)) return 'Hatchback';
  return 'Не указано';
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `tg-${Math.abs(hash)}`;
}

async function parseLinks(links) {
  const validLinks = links.map((link) => normalizeTelegramUrl(link.trim())).filter(Boolean);
  const cars = await Promise.allSettled(validLinks.map((link) => loadTelegramPost(link)));

  return cars.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;

    return {
      id: `error-${index}`,
      sourceUrl: validLinks[index],
      brand: 'Ошибка загрузки',
      model: '',
      year: null,
      price: null,
      currency: 'EUR',
      fuelType: 'Не указано',
      horsepower: null,
      bodyType: 'Не указано',
      mileage: null,
      drive: '',
      transmission: '',
      engine: '',
      status: 'On the Lithuania-Belarus border',
      description: result.reason.message,
      photos: [],
    };
  });
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (url === '/api/cars' && method === 'GET') {
    try {
      const links = await readLinks();
      const cars = await parseLinks(links);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(cars));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: error.message }));
    }
    return;
  }

  if (url === '/api/parse' && method === 'POST') {
    try {
      const payload = await parseBody(req);
      const links = Array.isArray(payload.links) ? payload.links : [];
      const cars = await parseLinks(links);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(cars));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: error.message || 'Ошибка парсинга' }));
    }
    return;
  }

  if (url === '/api/links' && method === 'PUT') {
    try {
      const payload = await parseBody(req);
      const links = Array.isArray(payload.links) ? payload.links.map((item) => normalizeTelegramUrl(item)) : [];
      await writeLinks(links);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, count: links.length }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: error.message }));
    }
    return;
  }

  if (url === '/api/links' && method === 'GET') {
    try {
      const links = await readLinks();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(links));
    } catch {
      res.writeHead(500);
      res.end('[]');
    }
    return;
  }

  if (url === '/admin' || url === '/admin.html') {
    await sendFile(res, '/admin.html');
    return;
  }

  await sendFile(res, url);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

module.exports = {
  parseTelegramHtml,
  normalizeTelegramUrl,
  extractStructuredSnippet,
  extractMessageEntries,
  extractAlbumPhotoUrls,
  collectRangeAlbumPhotos,
};
