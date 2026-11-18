export type ProductCategory =
  | 'All'
  | 'Panjabis'
  | 'Casual Shirts'
  | 'Polos'
  | 'T-Shirts'
  | 'Hoodies'
  | 'Sweatshirts'
  | 'Jackets'
  | 'Trousers/Denim';

export type CollectionTier = 'Platinum' | 'Luxury' | 'Premium' | 'Essential';

export type PaymentPreference =
  | 'Cash on Delivery'
  | 'bKash / Nagad'
  | 'Bank Transfer';

export type SizeChartGroupKey =
  | 'panjabis'
  | 'tops_shirts'
  | 'outerwear'
  | 'trousers_denim';

export interface SizeChartRow {
  size: string;
  values: string[];
}

export interface SizeChart {
  key: SizeChartGroupKey;
  label: string;
  unit: 'inches' | 'cm';
  note: string;
  columns: string[];
  rows: SizeChartRow[];
}

export interface Product {
  id: string;
  name: string;
  category: Exclude<ProductCategory, 'All'>;
  tier: CollectionTier;
  price: number;
  image: string;
  colorway: string;
  availability: 'In Stock' | 'Limited' | 'Out of Stock';
  stockCount: number;
  description: string;
  specs: string[];
  sizes: string[];
}

export interface CartItem {
  productId: string;
  name: string;
  colorway: string;
  size: string;
  price: number;
  image: string;
  quantity: number;
}

export interface CustomerDetails {
  fullName: string;
  phone: string;
  streetAddress: string;
  thana: string;
  zilla: string;
  district: string;
  paymentMethod: PaymentPreference;
  notes: string;
}

export type DisplayCurrency = 'BDT' | 'USD' | 'EUR' | 'AED';

export interface ExchangeRates {
  USD: number;
  EUR: number;
  AED: number;
}

export interface HeroBanner {
  eyebrow: string;
  headline: string;
  subtext: string;
  ctaLabel: string;
  image: string;
}

export interface ShopSettings {
  shopName: string;
  whatsappNumber: string;
  currencySymbol: string;
  freeShippingThreshold: number;
  flatShippingFee: number;
  aboutText: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  heroBanner: HeroBanner;
  exchangeRates: ExchangeRates;
}

export interface PreparedOrder {
  orderRef: string;
  message: string;
  whatsappUrl: string;
  total: number;
  itemCount: number;
}

export interface ProductReview {
  id: string;
  productId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAtMs: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  streetAddress: string;
  thana: string;
  zilla: string;
  district: string;
  isDefault: boolean;
}

export interface CustomerProfile {
  uid: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  photoUrl: string;
  addresses: SavedAddress[];
}

export type OrderStatus =
  | 'Sent via WhatsApp'
  | 'Confirmed'
  | 'Dispatched'
  | 'Delivered'
  | 'Cancelled';

export interface CustomerOrder {
  id: string;
  orderRef: string;
  customerId: string;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: DisplayCurrency;
  displayTotalFormatted: string;
  deliveryDetails: CustomerDetails;
  status: OrderStatus;
  createdAtMs: number;
}
