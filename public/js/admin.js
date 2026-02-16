import { createCar } from './api.js';

const adminForm = document.querySelector('#adminForm');
const adminMessage = document.querySelector('#adminMessage');

adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const payload = {
    brand: formData.get('brand'),
    model: formData.get('model'),
    year: Number(formData.get('year')),
    price: Number(formData.get('price')),
    fuelType: formData.get('fuelType'),
    horsepower: Number(formData.get('horsepower')),
    bodyType: formData.get('bodyType'),
    mileage: Number(formData.get('mileage')),
    description: formData.get('description'),
    photos: String(formData.get('photosText'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };

  adminMessage.textContent = 'Saving...';

  try {
    await createCar(payload);
    adminForm.reset();
    adminMessage.textContent = 'Car was added successfully.';
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});
