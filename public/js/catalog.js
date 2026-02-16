/**
 * Builds filter options and filter predicate.
 */
export function buildFilterOptions(cars) {
  return {
    brands: uniqueSorted(cars.map((car) => car.brand)),
    bodyTypes: uniqueSorted(cars.map((car) => car.bodyType)),
    fuelTypes: uniqueSorted(cars.map((car) => car.fuelType)),
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function applyFilters(cars, filters) {
  return cars.filter((car) => {
    if (filters.brand && car.brand !== filters.brand) return false;
    if (filters.bodyType && car.bodyType !== filters.bodyType) return false;
    if (filters.fuelType && car.fuelType !== filters.fuelType) return false;

    if (filters.horsepowerMin && car.horsepower < Number(filters.horsepowerMin)) return false;
    if (filters.horsepowerMax && car.horsepower > Number(filters.horsepowerMax)) return false;
    if (filters.yearMin && car.year < Number(filters.yearMin)) return false;
    if (filters.yearMax && car.year > Number(filters.yearMax)) return false;

    return true;
  });
}

export function formatPrice(car) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: car.currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(car.price);
}
