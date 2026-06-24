// 2026 FIFA World Cup host venues across North America
export const HOST_CITIES = [
  { city: 'Atlanta', country: 'USA', stadium: 'Mercedes-Benz Stadium', capacity: 71000, tagline: 'Retractable roof · 2017', image: 'assets/stadiums/atlanta.jpg', lat: 33.7554, lng: -84.4014, color: '#00e5ff' },
  { city: 'Boston', country: 'USA', stadium: 'Gillette Stadium', capacity: 65878, tagline: 'Foxborough · New England', image: 'assets/stadiums/boston.jpg', lat: 42.0908, lng: -71.2644, color: '#00e5ff' },
  { city: 'Dallas', country: 'USA', stadium: 'AT&T Stadium', capacity: 80000, tagline: 'Retractable roof · Arlington', image: 'assets/stadiums/dallas.jpg', lat: 32.7481, lng: -97.0932, color: '#00e5ff' },
  { city: 'Houston', country: 'USA', stadium: 'NRG Stadium', capacity: 72220, tagline: 'Retractable roof · Texas', image: 'assets/stadiums/houston.jpg', lat: 29.6847, lng: -95.4110, color: '#00e5ff' },
  { city: 'Kansas City', country: 'USA', stadium: 'Arrowhead Stadium', capacity: 76416, tagline: 'Sea of red · Missouri', image: 'assets/stadiums/kansas-city.jpg', lat: 39.0489, lng: -94.4845, color: '#00e5ff' },
  { city: 'Los Angeles', country: 'USA', stadium: 'SoFi Stadium', capacity: 70240, tagline: 'Indoor-outdoor · Inglewood', image: 'assets/stadiums/los-angeles.jpg', lat: 33.9534, lng: -118.3394, color: '#00e5ff' },
  { city: 'Miami', country: 'USA', stadium: 'Hard Rock Stadium', capacity: 65326, tagline: 'South Florida sun', image: 'assets/stadiums/miami.jpg', lat: 25.9578, lng: -80.2393, color: '#00e5ff' },
  { city: 'New York', country: 'USA', stadium: 'MetLife Stadium', capacity: 82500, tagline: 'NY · NJ metro', image: 'assets/stadiums/new-york.jpg', lat: 40.8135, lng: -74.0750, color: '#00e5ff' },
  { city: 'Philadelphia', country: 'USA', stadium: 'Lincoln Financial Field', capacity: 69796, tagline: 'The Linc · South Philly', image: 'assets/stadiums/philadelphia.jpg', lat: 39.9013, lng: -75.1679, color: '#00e5ff' },
  { city: 'San Francisco', country: 'USA', stadium: "Levi's Stadium", capacity: 68500, tagline: 'Silicon Valley · Santa Clara', image: 'assets/stadiums/san-francisco.jpg', lat: 37.4033, lng: -121.9698, color: '#00e5ff' },
  { city: 'Seattle', country: 'USA', stadium: 'Lumen Field', capacity: 69000, tagline: 'Emerald City · Sounders home', image: 'assets/stadiums/seattle.jpg', lat: 47.5951, lng: -122.3319, color: '#00e5ff' },
  { city: 'Guadalajara', country: 'Mexico', stadium: 'Estadio Akron', capacity: 49850, tagline: 'Chivas homeland', image: 'assets/stadiums/guadalajara.jpg', lat: 20.6817, lng: -103.4631, color: '#00ff88' },
  { city: 'Mexico City', country: 'Mexico', stadium: 'Estadio Azteca', capacity: 87523, tagline: 'Iconic · 1970 & 1986 finals', image: 'assets/stadiums/mexico-city.jpg', lat: 19.3028, lng: -99.1508, color: '#00ff88' },
  { city: 'Monterrey', country: 'Mexico', stadium: 'Estadio BBVA', capacity: 53500, tagline: 'La Sultana del Norte', image: 'assets/stadiums/monterrey.jpg', lat: 25.6691, lng: -100.2446, color: '#00ff88' },
  { city: 'Toronto', country: 'Canada', stadium: 'BMO Field', capacity: 45736, tagline: 'Lakefront · Maple Leaf Square', image: 'assets/stadiums/toronto.jpg', lat: 43.6331, lng: -79.4190, color: '#ff3366' },
  { city: 'Vancouver', country: 'Canada', stadium: 'BC Place', capacity: 54500, tagline: 'Retractable roof · Downtown', image: 'assets/stadiums/vancouver.jpg', lat: 49.2766, lng: -123.1126, color: '#ff3366' },
];

export function findHostCity(cityName) {
  return HOST_CITIES.find((city) => city.city === cityName) || null;
}
