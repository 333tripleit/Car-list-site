# Car list site

Minimal fullstack website for listing cars currently available on the Lithuania-Belarus border.

## Stack
- HTML5 + CSS3 + Vanilla JS (ES modules)
- Node.js built-in `http` server
- JSON file storage in `data/cars.json`

## Run
```bash
npm start
```
Then open: `http://localhost:3000`

## Features
- Responsive catalog with live filtering (brand, body type, fuel type, horsepower range, year range)
- Card-based grid with highlighted price and availability status
- Detailed modal with mini photo gallery (up to 10 images)
- `/admin` page to add new entries to JSON storage
