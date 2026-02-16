import { fetchLinks, parseTelegramLinks, saveLinks } from './api.js';
import { formatPrice } from './catalog.js';

const linksField = document.querySelector('#linksField');
const adminMessage = document.querySelector('#adminMessage');
const parseBtn = document.querySelector('#parseBtn');
const saveBtn = document.querySelector('#saveBtn');
const exportBtn = document.querySelector('#exportBtn');
const previewGrid = document.querySelector('#previewGrid');

let parsedCars = [];

initialize();

async function initialize() {
  const links = await fetchLinks();
  linksField.value = links.join('\n');
}

parseBtn.addEventListener('click', async () => {
  const links = collectLinks();
  if (!links.length) {
    adminMessage.textContent = 'Добавьте хотя бы одну ссылку.';
    return;
  }

  adminMessage.textContent = 'Загрузка постов...';

  try {
    parsedCars = await parseTelegramLinks(links);
    renderPreview(parsedCars);
    const checkedLinks = parsedCars.reduce((sum, car) => sum + (car.linkActions?.length || 0), 0);
    adminMessage.textContent = `Готово. Обработано постов: ${parsedCars.length}. Проверено ссылок: ${checkedLinks}`;
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

saveBtn.addEventListener('click', async () => {
  const links = collectLinks();

  try {
    const result = await saveLinks(links);
    adminMessage.textContent = `Ссылки сохранены (${result.count})`;
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

exportBtn.addEventListener('click', () => {
  if (!parsedCars.length) {
    adminMessage.textContent = 'Сначала выполните парсинг.';
    return;
  }

  const blob = new Blob([JSON.stringify(parsedCars, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `telegram-cars-export-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

function collectLinks() {
  return linksField.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderPreview(cars) {
  previewGrid.innerHTML = cars
    .map(
      (car) => `
      <article class="car-card">
        <img class="car-image" src="${car.photos?.[0] || ''}" alt="${car.brand} ${car.model}" />
        <div class="car-body">
          <h3 class="car-title">${car.brand} ${car.model}</h3>
          <p>${car.year || 'Год не указан'}</p>
          <div class="specs-brief">
            <span class="tag">${car.fuelType || 'Не указано'}</span>
            <span class="tag">${car.bodyType || 'Не указано'}</span>
            <span class="tag">${car.horsepower ? `${car.horsepower} hp` : 'hp n/a'}</span>
          </div>
          <p class="car-price">${car.price ? formatPrice(car) : 'Цена не указана'}</p>
          <a class="button ghost" href="${car.sourceUrl}" target="_blank" rel="noreferrer">Открыть пост</a>
          <p class="eyebrow">Проверок ссылок: ${car.linkActions?.length || 0}</p>
        </div>
      </article>
    `,
    )
    .join('');
}
