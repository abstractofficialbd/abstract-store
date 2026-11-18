import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { CURRENCY_OPTIONS } from '../data/catalog';
import { saveCustomerOrderToCloud } from '../lib/firebase';
import {
  CartItem,
  CustomerDetails,
  CustomerProfile,
  DisplayCurrency,
  PaymentPreference,
  PreparedOrder,
  ShopSettings,
} from '../types/shop';
import {
  buildWhatsAppUrl,
  calculateDeliveryCharge,
  formatCartOrderMessage,
  formatConvertedCurrency,
  generateOrderRef,
  validateCustomerDetails,
} from '../utils/whatsapp';
import { ResilientImage } from './ResilientImage';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  customer: CustomerDetails;
  onChangeCustomer: (next: CustomerDetails) => void;
  settings: ShopSettings;
  displayCurrency: DisplayCurrency;
  onChangeCurrency: (currency: DisplayCurrency) => void;
  currentUser: User | null;
  customerProfile: CustomerProfile | null;
  onOpenAccount: (tab: 'profile' | 'orders') => void;
  onClose: () => void;
  onUpdateQuantity: (productId: string, size: string, delta: number) => void;
  onRemoveItem: (productId: string, size: string) => void;
  onClearCart: () => void;
  isOwner?: boolean;
  onOpenSettings?: () => void;
}

const PAYMENT_OPTIONS: PaymentPreference[] = [
  'Cash on Delivery',
  'bKash / Nagad',
  'Bank Transfer',
];

export function CartDrawer({
  isOpen,
  items,
  customer,
  onChangeCustomer,
  settings,
  displayCurrency,
  onChangeCurrency,
  currentUser,
  customerProfile,
  onOpenAccount,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  isOwner = false,
  onOpenSettings,
}: CartDrawerProps) {
  const [errorText, setErrorText] = useState<string>('');
  const [preparedOrder, setPreparedOrder] = useState<PreparedOrder | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = calculateDeliveryCharge(subtotal, settings);
  const qualifiesForFreeShipping = subtotal > 0 && shipping === 0;
  const total = subtotal + shipping;
  const remainingForFreeShipping = Math.max(
    0,
    settings.freeShippingThreshold - subtotal
  );
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const savedAddresses = customerProfile?.addresses || [];

  const handlePrepareOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    const validationError = validateCustomerDetails(customer);
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setErrorText('');
    const orderRef = generateOrderRef();
    const message = formatCartOrderMessage({
      orderRef,
      items,
      customer,
      settings,
      subtotal,
      shipping,
      total,
      displayCurrency,
    });
    const whatsappUrl = buildWhatsAppUrl(settings.whatsappNumber, message);

    if (currentUser) {
      void saveCustomerOrderToCloud({
        user: currentUser,
        orderRef,
        items,
        subtotal,
        shipping,
        total,
        currency: displayCurrency,
        displayTotalFormatted: formatConvertedCurrency(
          total,
          displayCurrency,
          settings
        ),
        deliveryDetails: customer,
      }).catch(() => {
        // Firestore error already logged via handleFirestoreError
      });
    }

    setPreparedOrder({
      orderRef,
      message,
      whatsappUrl,
      total,
      itemCount: totalItemCount,
    });
  };

  const handleCopyMessage = async () => {
    if (!preparedOrder) return;
    try {
      await navigator.clipboard.writeText(preparedOrder.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleStartNewOrder = () => {
    setPreparedOrder(null);
    onClearCart();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#02042B]/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Bag and WhatsApp Checkout"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-full bg-[#F7F8FB] border-l border-[#E1E5EE] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#C5A467]/35 flex items-center justify-between gap-4 bg-[#000066] text-white">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-4 h-4 text-[#C5A467]" strokeWidth={1.75} />
            <h2 className="font-display text-xl font-semibold text-white">
              {preparedOrder ? 'Order Ready for WhatsApp' : 'Your Bag'}
            </h2>
            {!preparedOrder && (
              <span className="font-mono-tabular text-xs text-white/75">
                ({totalItemCount})
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bag"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {preparedOrder ? (
            <div className="space-y-5">
              <div className="p-5 bg-white border border-[#E1E5EE] rounded-xl">
                <p className="text-xs uppercase tracking-wider font-semibold text-[#8E6B2E] mb-1">
                  Order #{preparedOrder.orderRef} Prepared
                </p>
                <p className="text-sm text-[#434963] leading-relaxed">
                  Tap below to open WhatsApp with your sizes, garments, and delivery
                  address pre-filled. Sending the message confirms your order with{' '}
                  {settings.shopName}.
                </p>

                <div className="mt-4 pt-4 border-t border-[#EEF0F6] flex items-center justify-between text-sm">
                  <span className="text-[#59607A]">
                    {preparedOrder.itemCount} piece
                    {preparedOrder.itemCount > 1 ? 's' : ''}
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#0A1045]">
                    Total:{' '}
                    {formatConvertedCurrency(
                      preparedOrder.total,
                      displayCurrency,
                      settings
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <a
                  href={preparedOrder.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2} />
                  <span>Send Order in WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-medium text-[#0A1045] bg-white border border-[#D3D8E6] hover:bg-[#F1F3F8] rounded-lg transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#156142]" />
                      <span>Copied Order Text</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Order Message</span>
                    </>
                  )}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#59607A]">
                    Message Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreparedOrder(null)}
                    className="text-xs font-semibold text-[#000066] hover:underline cursor-pointer"
                  >
                    Edit Details
                  </button>
                </div>
                <pre className="p-4 bg-white border border-[#E1E5EE] rounded-lg text-xs text-[#262B47] whitespace-pre-wrap font-sans leading-relaxed">
                  {preparedOrder.message}
                </pre>
              </div>

              <div className="pt-3 border-t border-[#E1E5EE] flex items-center justify-between text-xs text-[#59607A]">
                <span>
                  Sending to:{' '}
                  <span className="font-mono-tabular">+{settings.whatsappNumber}</span>
                </span>
                {isOwner && onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[#000066] hover:underline font-medium cursor-pointer"
                  >
                    Change Shop Number
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartNewOrder}
                className="w-full py-2.5 text-xs font-medium text-[#59607A] hover:text-[#0A1045] cursor-pointer"
              >
                Clear Bag & Continue Shopping
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag
                className="w-10 h-10 text-[#A8B0C6] mb-3"
                strokeWidth={1.25}
              />
              <p className="font-display text-2xl font-semibold text-[#0A1045] mb-1">
                Your bag is empty
              </p>
              <p className="text-sm text-[#59607A] max-w-xs mb-6">
                Select garments from our collection to prepare your itemized WhatsApp
                order.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors cursor-pointer"
              >
                Browse Collection
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {settings.freeShippingThreshold > 0 && (
                <div className="p-3.5 bg-white border border-[#E1E5EE] rounded-lg text-xs text-[#434963]">
                  {qualifiesForFreeShipping ? (
                    <span className="font-semibold text-[#8E6B2E]">
                      Your order qualifies for complimentary delivery.
                    </span>
                  ) : (
                    <span>
                      Add{' '}
                      <span className="font-mono-tabular font-semibold text-[#000066]">
                        {formatConvertedCurrency(
                          remainingForFreeShipping,
                          displayCurrency,
                          settings
                        )}
                      </span>{' '}
                      more for complimentary delivery.
                    </span>
                  )}
                </div>
              )}

              <ul className="divide-y divide-[#E1E5EE]">
                {items.map((item) => (
                  <li
                    key={`${item.productId}-${item.size}`}
                    className="py-4 first:pt-0 flex gap-4"
                  >
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#F1F3F8] shrink-0 border border-[#E1E5EE]">
                      <ResilientImage
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#0A1045] truncate">
                            {item.name}
                          </h3>
                          <p className="text-xs text-[#59607A]">
                            {item.colorway} · Size {item.size}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.productId, item.size)}
                          aria-label={`Remove ${item.name}`}
                          className="p-1 text-[#8890A8] hover:text-[#B91C1C] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 mt-2">
                        <div className="inline-flex items-center border border-[#D3D8E6] rounded-md bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQuantity(item.productId, item.size, -1)
                            }
                            aria-label="Decrease quantity"
                            className="w-7 h-7 flex items-center justify-center text-[#0A1045] hover:bg-[#F1F3F8] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center font-mono-tabular text-xs font-medium">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQuantity(item.productId, item.size, 1)
                            }
                            aria-label="Increase quantity"
                            className="w-7 h-7 flex items-center justify-center text-[#0A1045] hover:bg-[#F1F3F8] cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="font-mono-tabular text-sm font-semibold text-[#0A1045]">
                          {formatConvertedCurrency(
                            item.price * item.quantity,
                            displayCurrency,
                            settings
                          )}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <form
                id="whatsapp-checkout-form"
                onSubmit={handlePrepareOrder}
                className="pt-5 border-t border-[#E1E5EE] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59607A]">
                    Customer &amp; Delivery Details
                  </h3>
                  {!currentUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAccount('profile');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#000066] hover:underline cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#8E6B2E]" />
                      <span>Sign in via OTP to save order &amp; address</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAccount('orders');
                      }}
                      className="text-[11px] font-semibold text-[#8E6B2E] hover:underline cursor-pointer"
                    >
                      View Order History
                    </button>
                  )}
                </div>

                {savedAddresses.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-[#59607A] inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#8E6B2E]" />
                      <span>Use Saved Address:</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {savedAddresses.map((addr) => {
                        const isSelected =
                          customer.streetAddress === addr.streetAddress &&
                          customer.thana === addr.thana &&
                          customer.zilla === addr.zilla &&
                          customer.district === addr.district;
                        return (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() =>
                              onChangeCustomer({
                                ...customer,
                                streetAddress: addr.streetAddress,
                                thana: addr.thana,
                                zilla: addr.zilla,
                                district: addr.district,
                              })
                            }
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#000066] text-white border-[#000066]'
                                : 'bg-white text-[#434963] border-[#D3D8E6] hover:border-[#000066]'
                            }`}
                          >
                            {addr.label}
                            {addr.isDefault ? ' (Default)' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {errorText && (
                  <p
                    role="alert"
                    className="p-3 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                  >
                    {errorText}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="checkout-name"
                      className="block text-xs font-medium text-[#434963] mb-1"
                    >
                      Customer Name *
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      required
                      value={customer.fullName}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, fullName: e.target.value })
                      }
                      placeholder="Farhan Rahman"
                      className="w-full h-10 px-3 text-sm bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="checkout-phone"
                      className="block text-xs font-medium text-[#434963] mb-1"
                    >
                      Contact No. *
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      required
                      value={customer.phone}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, phone: e.target.value })
                      }
                      placeholder="+880 17..."
                      className="w-full h-10 px-3 text-sm bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-white border border-[#E1E5EE] rounded-lg space-y-3">
                  <div>
                    <label
                      htmlFor="checkout-address"
                      className="block text-xs font-medium text-[#434963] mb-1"
                    >
                      Delivery Address (House, Road, Area) *
                    </label>
                    <input
                      id="checkout-address"
                      type="text"
                      required
                      value={customer.streetAddress}
                      onChange={(e) =>
                        onChangeCustomer({
                          ...customer,
                          streetAddress: e.target.value,
                        })
                      }
                      placeholder="House 14, Road 6, Block C, Banani"
                      className="w-full h-10 px-3 text-sm bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label
                        htmlFor="checkout-thana"
                        className="block text-xs font-medium text-[#434963] mb-1"
                      >
                        Thana *
                      </label>
                      <input
                        id="checkout-thana"
                        type="text"
                        required
                        value={customer.thana}
                        onChange={(e) =>
                          onChangeCustomer({ ...customer, thana: e.target.value })
                        }
                        placeholder="e.g. Banani"
                        className="w-full h-9 px-2.5 text-xs bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-zilla"
                        className="block text-xs font-medium text-[#434963] mb-1"
                      >
                        Zilla *
                      </label>
                      <input
                        id="checkout-zilla"
                        type="text"
                        required
                        value={customer.zilla}
                        onChange={(e) =>
                          onChangeCustomer({ ...customer, zilla: e.target.value })
                        }
                        placeholder="e.g. Dhaka"
                        className="w-full h-9 px-2.5 text-xs bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-district"
                        className="block text-xs font-medium text-[#434963] mb-1"
                      >
                        District *
                      </label>
                      <input
                        id="checkout-district"
                        type="text"
                        required
                        value={customer.district}
                        onChange={(e) =>
                          onChangeCustomer({ ...customer, district: e.target.value })
                        }
                        placeholder="e.g. Dhaka"
                        className="w-full h-9 px-2.5 text-xs bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#59607A]">
                    Please mention your Thana, Zilla, and District for accurate delivery.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#434963] mb-1.5">
                    Payment Preference
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const active = customer.paymentMethod === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            onChangeCustomer({ ...customer, paymentMethod: option })
                          }
                          className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#000066] text-white border-[#000066]'
                              : 'bg-white text-[#434963] border-[#D3D8E6] hover:border-[#000066]'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="checkout-notes"
                    className="block text-xs font-medium text-[#434963] mb-1"
                  >
                    Note to Us (Optional)
                  </label>
                  <textarea
                    id="checkout-notes"
                    rows={2}
                    value={customer.notes}
                    onChange={(e) =>
                      onChangeCustomer({ ...customer, notes: e.target.value })
                    }
                    placeholder="Share any specific request—sizing preference, delivery timing, or special instructions..."
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
              </form>
            </div>
          )}
        </div>

        {!preparedOrder && items.length > 0 && (
          <div className="px-6 py-4 bg-white border-t border-[#E1E5EE] space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#EEF0F6]">
              <span className="text-[11px] font-medium text-[#59607A]">
                View totals in
              </span>
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#F1F3F8] border border-[#E1E5EE] rounded-md">
                {CURRENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => onChangeCurrency(opt.code)}
                    className={`px-2 py-0.5 text-[11px] font-mono-tabular font-medium rounded cursor-pointer transition-colors ${
                      displayCurrency === opt.code
                        ? 'bg-[#000066] text-white'
                        : 'text-[#434963] hover:text-[#000066]'
                    }`}
                  >
                    {opt.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[#59607A]">
                <span>Subtotal</span>
                <span className="font-mono-tabular">
                  {formatConvertedCurrency(subtotal, displayCurrency, settings)}
                </span>
              </div>
              <div className="flex justify-between text-[#59607A]">
                <span>Delivery</span>
                <span className="font-mono-tabular">
                  {shipping === 0
                    ? 'Free'
                    : formatConvertedCurrency(shipping, displayCurrency, settings)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-[#0A1045] pt-1.5 border-t border-[#EEF0F6]">
                <span>Total</span>
                <span className="font-mono-tabular">
                  {formatConvertedCurrency(total, displayCurrency, settings)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              form="whatsapp-checkout-form"
              className="w-full h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467]"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={2} />
              <span>Place Order via WhatsApp</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
