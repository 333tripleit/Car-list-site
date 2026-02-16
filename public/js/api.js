/**
 * API layer for Telegram-based import/export flow.
 */
export async function fetchCars() {
  const response = await fetch('/api/cars');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Unable to fetch car data.');
  }
  return data;
}

export async function parseTelegramLinks(links) {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ links }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка парсинга');
  }

  return data;
}

export async function fetchLinks() {
  const response = await fetch('/api/links');
  return response.json();
}

export async function saveLinks(links) {
  const response = await fetch('/api/links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ links }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Не удалось сохранить ссылки');
  }

  return data;
}
