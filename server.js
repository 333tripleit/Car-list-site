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
  return parsed.toString();
}

async function loadTelegramPost(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CarCatalogBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить пост: ${response.status}`);
  }

  const html = await response.text();
  return parseTelegramHtml(html, url);
}

function parseTelegramHtml(html, sourceUrl) {
  const textBlockMatch = html.match(/<div class="tgme_widget_message_text[\s\S]*?<\/div>/);
  const textBlock = textBlockMatch ? textBlockMatch[0] : '';
  const cleanText = decodeHtml(stripTags(textBlock)).replace(/\s+/g, ' ').trim();

  const photos = extractPhotoUrls(html).slice(0, 10);

  const title = find(cleanText, /🔥\s*([^🔥\n]+?)\s*🔥/i) || find(cleanText, /^([^🌟\n]{3,40})/i) || 'Unknown model';
  const year = Number(find(cleanText, /Год\s*(\d{4})/i)) || null;
  const mileage = toNumber(find(cleanText, /Пробег[:\s]*([\d\s]{2,})\s*км/i));
  const horsepower = toNumber(find(cleanText, /(\d{2,4})\s*л\.?\s*с\.?/i));
  const bodyType = detectBodyType(cleanText);
  const fuelType = detectFuelType(cleanText);
  const drive = find(cleanText, /Привод[:\s]*([^🔧\n]+)/i)?.trim() || '';
  const transmission = find(cleanText, /Коробка[:\s]*([^\n]+)/i)?.trim() || '';
  const engine = find(cleanText, /Двигатель[:\s]*([^\n(]+)/i)?.trim() || '';

  const [brand, ...modelParts] = title.replace(/\//g, ' / ').split(' ');

  return {
    id: hashCode(sourceUrl),
    sourceUrl,
    brand: brand || 'Unknown',
    model: modelParts.join(' ').trim() || title,
    year,
    price: null,
    currency: 'EUR',
    fuelType: fuelType || engine || 'Не указано',
    horsepower: horsepower || null,
    bodyType,
    mileage: mileage || null,
    drive,
    transmission,
    engine,
    status: 'On the Lithuania-Belarus border',
    description: cleanText,
    photos,
  };
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
  };

  return input.replace(/&nbsp;|&amp;|&quot;|&#39;/g, (entity) => entities[entity] || entity);
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

  return cars
    .map((result, index) => {
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
    })
    .filter(Boolean);
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

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
