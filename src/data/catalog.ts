import {
  DisplayCurrency,
  Product,
  ProductCategory,
  ShopSettings,
  SizeChart,
  SizeChartGroupKey,
} from '../types/shop';

export const HERO_IMAGE = '/src/assets/images/hero_abstract_luxury_1794991964716.jpg';

export const CURRENCY_OPTIONS: {
  code: DisplayCurrency;
  label: string;
  shortLabel: string;
  symbol: string;
}[] = [
  { code: 'BDT', label: 'Bangladeshi Taka (৳)', shortLabel: 'BDT ৳', symbol: '৳' },
  { code: 'USD', label: 'US Dollar ($)', shortLabel: 'USD $', symbol: '$' },
  { code: 'EUR', label: 'Euro (€)', shortLabel: 'EUR €', symbol: '€' },
  { code: 'AED', label: 'UAE Dirham (AED)', shortLabel: 'AED', symbol: 'AED ' },
];

export const CATEGORIES: ProductCategory[] = [
  'All',
  'Panjabis',
  'Casual Shirts',
  'Polos',
  'T-Shirts',
  'Hoodies',
  'Sweatshirts',
  'Jackets',
  'Trousers/Denim',
];

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shopName: 'ABSTRACT.',
  whatsappNumber: '8801711000000',
  currencySymbol: '৳',
  freeShippingThreshold: 5000,
  flatShippingFee: 120,
  aboutText:
    'ABSTRACT. is a contemporary men’s fashion label built around sharp silhouettes, long-staple textiles, and disciplined tailoring. From signature Panjabis and casual shirts to heavyweight essentials, every piece is crafted for everyday presence and ordered directly via WhatsApp.',
  facebookUrl: 'https://www.facebook.com',
  instagramUrl: 'https://www.instagram.com',
  tiktokUrl: 'https://www.tiktok.com',
  heroBanner: {
    eyebrow: 'Platinum · Luxury · Premium · Essential',
    headline: 'Refined menswear crafted for presence.',
    subtext:
      'From tailored Panjabis and mercerized polos to structured outerwear, fleece, and denim. Order directly via WhatsApp with nationwide Cash on Delivery.',
    ctaLabel: 'Explore Collection',
    image: HERO_IMAGE,
  },
  exchangeRates: {
    USD: 120,
    EUR: 130,
    AED: 32.7,
  },
};

export function getSizeChartKeyForCategory(
  category: Exclude<ProductCategory, 'All'>
): SizeChartGroupKey {
  if (category === 'Panjabis') return 'panjabis';
  if (category === 'Trousers/Denim') return 'trousers_denim';
  if (category === 'Hoodies' || category === 'Sweatshirts' || category === 'Jackets') {
    return 'outerwear';
  }
  return 'tops_shirts';
}

export const DEFAULT_SIZE_CHARTS: Record<SizeChartGroupKey, SizeChart> = {
  panjabis: {
    key: 'panjabis',
    label: 'Panjabis',
    unit: 'inches',
    note: 'Garment measurements laid flat. Expect ±0.5 inch tailoring tolerance.',
    columns: ['Chest', 'Length'],
    rows: [
      { size: '38 (S)', values: ['40"', '40"'] },
      { size: '40 (M)', values: ['42"', '41.5"'] },
      { size: '42 (L)', values: ['44"', '43"'] },
      { size: '44 (XL)', values: ['46"', '44.5"'] },
    ],
  },
  tops_shirts: {
    key: 'tops_shirts',
    label: 'Shirts, Polos & T-Shirts',
    unit: 'inches',
    note: 'Measured across chest 1 inch below armhole. Relaxed studio cut.',
    columns: ['Chest', 'Length'],
    rows: [
      { size: 'S', values: ['40"', '27.5"'] },
      { size: 'M', values: ['42"', '28.5"'] },
      { size: 'L', values: ['44"', '29.5"'] },
      { size: 'XL', values: ['46"', '30.5"'] },
    ],
  },
  outerwear: {
    key: 'outerwear',
    label: 'Hoodies, Sweatshirts & Jackets',
    unit: 'inches',
    note: 'Drop-shoulder silhouette with room for layering underneath.',
    columns: ['Chest', 'Length'],
    rows: [
      { size: 'S', values: ['43"', '26.5"'] },
      { size: 'M', values: ['45"', '27.5"'] },
      { size: 'L', values: ['47"', '28.5"'] },
      { size: 'XL', values: ['49"', '29.5"'] },
    ],
  },
  trousers_denim: {
    key: 'trousers_denim',
    label: 'Trousers & Denim',
    unit: 'inches',
    note: 'Standard inseam tailored with clean hem allowance.',
    columns: ['Waist', 'Length'],
    rows: [
      { size: '30 (S)', values: ['30"', '40.0"'] },
      { size: '32 (M)', values: ['32"', '40.5"'] },
      { size: '34 (L)', values: ['34"', '41.0"'] },
      { size: '36 (XL)', values: ['36"', '41.5"'] },
    ],
  },
};

export const INITIAL_PRODUCTS: Product[] = [];
