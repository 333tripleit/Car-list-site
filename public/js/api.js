/**
 * API layer. Keeps network logic in one place for easy future replacement.
 */
export async function fetchCars() {
  const response = await fetch('/api/cars');
  if (!response.ok) {
    throw new Error('Unable to fetch car data.');
  }
  return response.json();
}

export async function createCar(carPayload) {
  const response = await fetch('/api/cars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(carPayload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Could not save car.');
  }

  return data;
}
