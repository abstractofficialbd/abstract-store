import {
  CartItem,
  CustomerDetails,
  DisplayCurrency,
  ShopSettings,
} from '../types/shop';

export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function formatCurrency(amount: number, symbol: string): string {
  const rounded = Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
  return `${symbol}${rounded.toLocaleString('en-US')}`;
}

export function getCurrencySymbolForDisplay(
  displayCurrency: DisplayCurrency,
  baseSymbol: string
): string {
  if (displayCurrency === 'USD') return '$';
  if (displayCurrency === 'EUR') return '€';
  if (displayCurrency === 'AED') return 'AED ';
  return baseSymbol || '৳';
}

export function convertFromBasePrice(
  amountInBase: number,
  displayCurrency: DisplayCurrency,
  settings: ShopSettings
): number {
  if (displayCurrency === 'BDT') return amountInBase;
  const rates = settings.exchangeRates || { USD: 120, EUR: 130, AED: 32.7 };
  const divisor =
    displayCurrency === 'USD'
      ? Math.max(0.01, rates.USD || 120)
      : displayCurrency === 'EUR'
      ? Math.max(0.01, rates.EUR || 130)
      : Math.max(0.01, rates.AED || 32.7);
  return amountInBase / divisor;
}

export function formatConvertedCurrency(
  amountInBase: number,
  displayCurrency: DisplayCurrency,
  settings: ShopSettings
): string {
  const symbol = getCurrencySymbolForDisplay(
    displayCurrency,
    settings.currencySymbol
  );
  if (displayCurrency === 'BDT') {
    return formatCurrency(amountInBase, symbol);
  }
  const converted = convertFromBasePrice(amountInBase, displayCurrency, settings);
  return `${symbol}${converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateOrderRef(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `ABS-${digits}`;
}

export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  const cleanPhone = sanitizePhoneNumber(phoneNumber);
  const encoded = encodeURIComponent(message);
  if (!cleanPhone) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

export function validateCustomerDetails(customer: CustomerDetails): string {
  if (!customer.fullName.trim()) {
    return 'Please enter your full name.';
  }
  if (!customer.phone.trim()) {
    return 'Please enter your contact number for order confirmation and tracking.';
  }
  if (!customer.streetAddress.trim()) {
    return 'Please enter your house, road, or area address.';
  }
  if (!customer.thana.trim()) {
    return 'Please mention your Thana in the delivery address.';
  }
  if (!customer.zilla.trim()) {
    return 'Please mention your Zilla in the delivery address.';
  }
  if (!customer.district.trim()) {
    return 'Please mention your District in the delivery address.';
  }
  return '';
}

export function formatCartOrderMessage(params: {
  orderRef: string;
  items: CartItem[];
  customer: CustomerDetails;
  settings: ShopSettings;
  subtotal: number;
  shipping: number;
  total: number;
  displayCurrency?: DisplayCurrency;
}): string {
  const {
    orderRef,
    items,
    customer,
    settings,
    subtotal,
    shipping,
    total,
    displayCurrency = 'BDT',
  } = params;
  const { shopName } = settings;

  const fmt = (val: number) =>
    formatConvertedCurrency(val, displayCurrency, settings);

  const itemLines = items.map(
    (item, index) =>
      `${index + 1}. ${item.name} (${item.colorway} · Size ${item.size}) × ${item.quantity} — ${fmt(
        item.price * item.quantity
      )}`
  );

  const lines: string[] = [
    `*New Order — ${shopName}*`,
    `Order Ref: #${orderRef}`,
    ...(displayCurrency !== 'BDT' ? [`Currency: ${displayCurrency}`] : []),
    '',
    '*Items:*',
    ...itemLines,
    '',
    `Subtotal: ${fmt(subtotal)}`,
    `Delivery: ${shipping === 0 ? 'Free' : fmt(shipping)}`,
    `*Total: ${fmt(total)}*`,
    '',
    '*Customer & Delivery Details:*',
    `Customer Name: ${customer.fullName.trim()}`,
    `Contact No: ${customer.phone.trim()}`,
    `Address: ${customer.streetAddress.trim()}`,
    `Thana: ${customer.thana.trim()}`,
    `Zilla: ${customer.zilla.trim()}`,
    `District: ${customer.district.trim()}`,
    `Payment: ${customer.paymentMethod}`,
  ];

  if (customer.notes.trim()) {
    lines.push(`Note: ${customer.notes.trim()}`);
  }

  return lines.join('\n');
}

export function calculateDeliveryCharge(
  subtotal: number,
  settings: ShopSettings
): number {
  if (subtotal <= 0) return 0;
  if (
    settings.freeShippingThreshold > 0 &&
    subtotal >= settings.freeShippingThreshold
  ) {
    return 0;
  }
  return settings.flatShippingFee;
}

export function formatQuickSingleOrderMessage(params: {
  orderRef?: string;
  productName: string;
  colorway: string;
  size: string;
  quantity: number;
  unitPrice: number;
  settings: ShopSettings;
  displayCurrency?: DisplayCurrency;
  customer?: CustomerDetails;
}): string {
  const {
    orderRef,
    productName,
    colorway,
    size,
    quantity,
    unitPrice,
    settings,
    displayCurrency = 'BDT',
    customer,
  } = params;
  const subtotal = unitPrice * quantity;
  const deliveryCharge = calculateDeliveryCharge(subtotal, settings);
  const totalBill = subtotal + deliveryCharge;
  const fmt = (val: number) =>
    formatConvertedCurrency(val, displayCurrency, settings);

  const lines: string[] = [
    `*Quick Order — ${settings.shopName}*`,
    ...(orderRef ? [`Order Ref: #${orderRef}`] : []),
    `Item: ${productName}`,
    `Color: ${colorway}`,
    `Size: ${size}`,
    `Quantity: ${quantity}`,
    ...(displayCurrency !== 'BDT' ? [`Currency: ${displayCurrency}`] : []),
    `Subtotal: ${fmt(subtotal)}`,
    `Delivery Charge: ${deliveryCharge === 0 ? 'Free' : fmt(deliveryCharge)}`,
    `*Total Bill: ${fmt(totalBill)}*`,
  ];

  if (customer) {
    lines.push(
      '',
      '*Customer & Delivery Details:*',
      `Customer Name: ${customer.fullName.trim()}`,
      `Contact No: ${customer.phone.trim()}`,
      `Address: ${customer.streetAddress.trim()}`,
      `Thana: ${customer.thana.trim()}`,
      `Zilla: ${customer.zilla.trim()}`,
      `District: ${customer.district.trim()}`
    );
    if (customer.notes.trim()) {
      lines.push(`Note: ${customer.notes.trim()}`);
    }
  }

  lines.push(
    '',
    'Assalamu Alaikum / Hi! I would like to order this piece. Please confirm availability and delivery.'
  );

  return lines.join('\n');
}

export function formatOrderStatusMessage(params: {
  customerName: string;
  customerPhone: string;
  settings: ShopSettings;
}): string {
  const { customerName, customerPhone, settings } = params;
  const cleanName = customerName.trim() || 'Farhan Rahman';
  const cleanPhone = customerPhone.trim() || '+880 1711-000000';

  return [
    `*Order Status Check — ${settings.shopName}*`,
    `Name: ${cleanName}`,
    `Phone: ${cleanPhone}`,
    '',
    'Assalamu Alaikum / Hi! Could you please share an update on my order status and estimated delivery?',
  ].join('\n');
}


