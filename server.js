const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const dataFile = path.join(__dirname, 'data', 'cars.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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

async function readCars() {
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw);
}

async function writeCars(cars) {
  await fs.writeFile(dataFile, JSON.stringify(cars, null, 2), 'utf-8');
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

function normalizeCar(input) {
  const photos = Array.isArray(input.photos)
    ? input.photos.filter(Boolean).slice(0, 10)
    : [];

  return {
    id: `car-${Date.now()}`,
    brand: String(input.brand || '').trim(),
    model: String(input.model || '').trim(),
    year: Number(input.year),
    price: Number(input.price),
    currency: String(input.currency || 'EUR').trim() || 'EUR',
    fuelType: String(input.fuelType || '').trim(),
    horsepower: Number(input.horsepower),
    bodyType: String(input.bodyType || '').trim(),
    mileage: Number(input.mileage) || 0,
    status: 'On the Lithuania-Belarus border',
    description: String(input.description || '').trim(),
    photos,
  };
}

function validateCar(car) {
  const requiredText = ['brand', 'model', 'fuelType', 'bodyType'];
  for (const key of requiredText) {
    if (!car[key]) return `${key} is required`;
  }

  if (!Number.isFinite(car.year) || car.year < 1980) return 'year is invalid';
  if (!Number.isFinite(car.price) || car.price < 1) return 'price is invalid';
  if (!Number.isFinite(car.horsepower) || car.horsepower < 1) return 'horsepower is invalid';
  if (!car.photos.length) return 'at least one photo is required';
  return null;
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (url === '/api/cars' && method === 'GET') {
    try {
      const cars = await readCars();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(cars));
    } catch {
      res.writeHead(500);
      res.end('Failed to read cars data');
    }
    return;
  }

  if (url === '/api/cars' && method === 'POST') {
    try {
      const payload = await parseBody(req);
      const normalized = normalizeCar(payload);
      const validationError = validateCar(normalized);

      if (validationError) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: validationError }));
        return;
      }

      const cars = await readCars();
      cars.unshift(normalized);
      await writeCars(cars);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(normalized));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: error.message || 'Failed to save car' }));
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
