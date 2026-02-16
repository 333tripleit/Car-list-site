import { fetchCars } from './api.js';
import { applyFilters, buildFilterOptions, formatPrice } from './catalog.js';
import { renderCarModal } from './modal.js';

const carsGrid = document.querySelector('#carsGrid');
const catalogCount = document.querySelector('#catalogCount');
const filterForm = document.querySelector('#filterForm');
const modal = document.querySelector('#carModal');
const closeModalBtn = document.querySelector('#closeModalBtn');
const modalContent = document.querySelector('#modalContent');

const filterElements = {
  brand: document.querySelector('#brandFilter'),
  bodyType: document.querySelector('#bodyTypeFilter'),
  fuelType: document.querySelector('#fuelTypeFilter'),
  horsepowerMin: document.querySelector('#horsepowerMinFilter'),
  horsepowerMax: document.querySelector('#horsepowerMaxFilter'),
  yearMin: document.querySelector('#yearMinFilter'),
  yearMax: document.querySelector('#yearMaxFilter'),
};

let allCars = [];

initializePage();

async function initializePage() {
  try {
    allCars = await fetchCars();
    hydrateFilterSelects(allCars);
    renderCatalog(allCars);
  } catch (error) {
    carsGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }

  filterForm.addEventListener('input', handleFiltersChange);
  filterForm.addEventListener('reset', () => {
    // Wait for native form reset to update values before applying filters.
    window.setTimeout(() => renderCatalog(allCars), 0);
  });

  closeModalBtn.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => {
    const dialogDimensions = modal.getBoundingClientRect();
    const clickedOutside =
      event.clientX < dialogDimensions.left ||
      event.clientX > dialogDimensions.right ||
      event.clientY < dialogDimensions.top ||
      event.clientY > dialogDimensions.bottom;

    if (clickedOutside) {
      modal.close();
    }
  });
}

function hydrateFilterSelects(cars) {
  const options = buildFilterOptions(cars);
  fillSelect(filterElements.brand, options.brands);
  fillSelect(filterElements.bodyType, options.bodyTypes);
  fillSelect(filterElements.fuelType, options.fuelTypes);
}

function fillSelect(selectElement, values) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });
}

function handleFiltersChange() {
  const filters = Object.fromEntries(new FormData(filterForm).entries());
  const filtered = applyFilters(allCars, filters);
  renderCatalog(filtered);
}

function renderCatalog(cars) {
  catalogCount.textContent = `${cars.length} car${cars.length === 1 ? '' : 's'}`;

  if (!cars.length) {
    carsGrid.innerHTML = '<div class="empty-state">No cars found for selected filters.</div>';
    return;
  }

  carsGrid.innerHTML = cars
    .map(
      (car) => `
      <article class="car-card">
        <img class="car-image" src="${car.photos?.[0] || ''}" alt="${car.brand} ${car.model}" loading="lazy" />
        <div class="car-body">
          <h3 class="car-title">${car.brand} ${car.model}</h3>
          <p>${car.year || 'Year n/a'}</p>
          <div class="specs-brief">
            <span class="tag">${car.fuelType}</span>
            <span class="tag">${car.bodyType}</span>
            <span class="tag">${car.horsepower ? `${car.horsepower} hp` : 'hp n/a'}</span>
          </div>
          <p class="car-price">${car.price ? formatPrice(car) : 'Price on request'}</p>
          <p class="status">${car.status}</p>
          <button class="button" data-car-id="${car.id}">View details</button>
        </div>
      </article>
    `,
    )
    .join('');

  carsGrid.querySelectorAll('[data-car-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedCar = allCars.find((car) => car.id === button.dataset.carId);
      if (!selectedCar) return;
      renderCarModal(modalContent, selectedCar);
      modal.showModal();
    });
  });
}
