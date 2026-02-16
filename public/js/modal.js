import { formatPrice } from './catalog.js';

/**
 * Renders detailed information in a modal dialog with mini gallery.
 */
export function renderCarModal(modalContentElement, car) {
  const photos = (car.photos || []).slice(0, 10);
  const mainImage = photos[0] || '';

  modalContentElement.innerHTML = `
    <div class="modal-grid">
      <div>
        <img class="modal-main-image" id="modalMainImage" src="${mainImage}" alt="${car.brand} ${car.model}" />
        <div class="thumbnail-row" id="thumbnailRow">
          ${photos
            .map(
              (photo, index) =>
                `<img src="${photo}" alt="${car.brand} ${car.model} photo ${index + 1}" data-photo="${photo}" class="${
                  index === 0 ? 'active' : ''
                }" />`,
            )
            .join('')}
        </div>
      </div>
      <div>
        <h2>${car.brand} ${car.model}</h2>
        <p class="eyebrow">${car.year} • ${car.bodyType}</p>
        <p class="car-price">${formatPrice(car)}</p>
        <p class="status">${car.status}</p>
        <p>${car.description || ''}</p>

        <div class="spec-list">
          ${specItem('Make', car.brand)}
          ${specItem('Model', car.model)}
          ${specItem('Year', car.year)}
          ${specItem('Fuel', car.fuelType)}
          ${specItem('Horsepower', `${car.horsepower} hp`)}
          ${specItem('Body type', car.bodyType)}
          ${specItem('Mileage', `${car.mileage || 0} km`)}
        </div>
      </div>
    </div>
  `;

  wireGalleryInteractions(modalContentElement);
}

function specItem(label, value) {
  return `<div class="spec-item"><span>${label}</span><strong>${value}</strong></div>`;
}

function wireGalleryInteractions(modalContentElement) {
  const mainImageEl = modalContentElement.querySelector('#modalMainImage');
  const thumbnails = modalContentElement.querySelectorAll('#thumbnailRow img');

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
      const selected = thumbnail.dataset.photo;
      mainImageEl.src = selected;
      thumbnails.forEach((item) => item.classList.remove('active'));
      thumbnail.classList.add('active');
    });
  });
}
