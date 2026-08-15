/**
 * The shop catalogue. One entry per block in the mall (20 blocks).
 *
 * `sign` is the emoji rendered on the storefront, `items` are what a mission can
 * ask you to buy there, and `hue` drives the facade / awning / mat colour.
 */
export const SHOP_CATALOG = [
  { key: 'icecream', sign: '🍦', hue: 0.94, items: ['🍦', '🍨'], name: { en: 'ice cream shop', de: 'Eisladen' } },
  { key: 'toys', sign: '🧸', hue: 0.07, items: ['🧸', '🪀'], name: { en: 'toy shop', de: 'Spielzeugladen' } },
  { key: 'balloons', sign: '🎈', hue: 0.0, items: ['🎈', '🎊'], name: { en: 'balloon stand', de: 'Luftballonstand' } },
  { key: 'shoes', sign: '👟', hue: 0.58, items: ['👟', '🥾'], name: { en: 'shoe shop', de: 'Schuhladen' } },
  { key: 'donuts', sign: '🍩', hue: 0.05, items: ['🍩', '🥐'], name: { en: 'donut shop', de: 'Donutladen' } },
  { key: 'cake', sign: '🎂', hue: 0.9, items: ['🎂', '🧁'], name: { en: 'cake shop', de: 'Kuchenladen' } },
  { key: 'fish', sign: '🐠', hue: 0.52, items: ['🐠', '🐡'], name: { en: 'fish shop', de: 'Fischladen' } },
  { key: 'dresses', sign: '👗', hue: 0.86, items: ['👗', '👒'], name: { en: 'dress shop', de: 'Kleiderladen' } },
  { key: 'books', sign: '📚', hue: 0.1, items: ['📚', '📖'], name: { en: 'book shop', de: 'Buchladen' } },
  // German names are all masculine "der …laden", so the spoken line can safely
  // use "Geh zum …" without needing per-shop article handling.
  { key: 'pizza', sign: '🍕', hue: 0.02, items: ['🍕', '🌭'], name: { en: 'pizza place', de: 'Pizzaladen' } },
  { key: 'art', sign: '🎨', hue: 0.75, items: ['🎨', '🖍️'], name: { en: 'paint shop', de: 'Bastelladen' } },
  { key: 'flowers', sign: '🌸', hue: 0.92, items: ['🌸', '🌻'], name: { en: 'flower shop', de: 'Blumenladen' } },
  { key: 'sports', sign: '⚽', hue: 0.35, items: ['⚽', '🏀'], name: { en: 'sport shop', de: 'Sportladen' } },
  { key: 'music', sign: '🎧', hue: 0.68, items: ['🎧', '🎸'], name: { en: 'music shop', de: 'Musikladen' } },
  { key: 'fruit', sign: '🍓', hue: 0.99, items: ['🍓', '🍉'], name: { en: 'fruit shop', de: 'Obstladen' } },
  { key: 'hats', sign: '🎩', hue: 0.72, items: ['🎩', '🧢'], name: { en: 'hat shop', de: 'Hutladen' } },
  { key: 'bikes', sign: '🚲', hue: 0.45, items: ['🚲', '🛴'], name: { en: 'bike shop', de: 'Fahrradladen' } },
  { key: 'pets', sign: '🐶', hue: 0.11, items: ['🐶', '🐱'], name: { en: 'pet shop', de: 'Tierladen' } },
  { key: 'candy', sign: '🍬', hue: 0.88, items: ['🍬', '🍭'], name: { en: 'candy shop', de: 'Süßigkeitenladen' } },
  { key: 'kites', sign: '🪁', hue: 0.55, items: ['🪁', '🎏'], name: { en: 'kite shop', de: 'Drachenladen' } },
];
