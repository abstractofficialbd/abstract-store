import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  LogIn,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Ruler,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { CURRENCY_OPTIONS, getSizeChartKeyForCategory } from '../data/catalog';
import {
  OperationType,
  addProductReviewToCloud,
  db,
  handleFirestoreError,
  removeProductReviewFromCloud,
  saveCustomerOrderToCloud,
} from '../lib/firebase';
import {
  CustomerDetails,
  CustomerProfile,
  DisplayCurrency,
  Product,
  ProductReview,
  ShopSettings,
  SizeChart,
  SizeChartGroupKey,
} from '../types/shop';
import {
  buildWhatsAppUrl,
  calculateDeliveryCharge,
  formatConvertedCurrency,
  formatQuickSingleOrderMessage,
  generateOrderRef,
  validateCustomerDetails,
} from '../utils/whatsapp';
import { ResilientImage } from './ResilientImage';

interface ProductDetailModalProps {
  product: Product | null;
  customer: CustomerDetails;
  onChangeCustomer: (next: CustomerDetails) => void;
  settings: ShopSettings;
  sizeCharts: Record<SizeChartGroupKey, SizeChart>;
  displayCurrency: DisplayCurrency;
  onChangeCurrency: (currency: DisplayCurrency) => void;
  currentUser: User | null;
  customerProfile: CustomerProfile | null;
  isOwner: boolean;
  onSignInForReview: () => Promise<void>;
  onOpenAccount: (tab: 'profile' | 'orders') => void;
  onClose: () => void;
  onAddToBag: (product: Product, size: string, quantity: number) => void;
}

export function ProductDetailModal({
  product,
  customer,
  onChangeCustomer,
  settings,
  sizeCharts,
  displayCurrency,
  onChangeCurrency,
  currentUser,
  customerProfile,
  isOwner,
  onSignInForReview,
  onOpenAccount,
  onClose,
  onAddToBag,
}: ProductDetailModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [quantity, setQuantity] = useState<number>(1);
  const [showSizeGuide, setShowSizeGuide] = useState<boolean>(false);
  const [showQuickOrderForm, setShowQuickOrderForm] = useState<boolean>(false);
  const [quickOrderError, setQuickOrderError] = useState<string>('');
  const [preparedQuickOrder, setPreparedQuickOrder] = useState<{
    message: string;
    whatsappUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewerName, setReviewerName] = useState<string>('');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewError, setReviewError] = useState<string>('');
  const [reviewSuccess, setReviewSuccess] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [isSigningInForReview, setIsSigningInForReview] = useState<boolean>(false);

  const chart = product
    ? sizeCharts[getSizeChartKeyForCategory(product.category)]
    : null;

  const availableSizes =
    chart && chart.rows.length > 0
      ? chart.rows.map((r) => r.size)
      : product?.sizes || ['S', 'M', 'L', 'XL'];

  useEffect(() => {
    if (product) {
      setSelectedSize(availableSizes[1] || availableSizes[0] || 'M');
      setQuantity(1);
      setShowSizeGuide(false);
      setShowQuickOrderForm(false);
      setQuickOrderError('');
      setPreparedQuickOrder(null);
      setReviewRating(5);
      setHoverRating(0);
      setReviewComment('');
      setReviewError('');
      setReviewSuccess('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    const resolvedName =
      customerProfile?.fullName?.trim() ||
      currentUser?.displayName ||
      customer.fullName.trim();
    if (resolvedName && !reviewerName.trim()) {
      setReviewerName(resolvedName);
    }
  }, [currentUser, customerProfile, customer.fullName, reviewerName]);

  useEffect(() => {
    if (!product) {
      setReviews([]);
      return;
    }
    setReviewsLoading(true);
    const reviewsRef = collection(db, 'products', product.id, 'reviews');
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: ProductReview[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as { toMillis?: () => number } | null;
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            productId: String(data.productId || product.id),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Customer'),
            rating: Math.min(5, Math.max(1, Number(data.rating) || 5)),
            comment: String(data.comment || ''),
            createdAtMs:
              ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now(),
          };
        });
        setReviews(loaded);
        setReviewsLoading(false);
      },
      (err) => {
        setReviewsLoading(false);
        handleFirestoreError(err, OperationType.LIST, `products/${product.id}/reviews`);
      }
    );
    return () => unsubscribe();
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  if (!product) return null;

  const subtotal = product.price * quantity;
  const deliveryCharge = calculateDeliveryCharge(subtotal, settings);
  const totalBill = subtotal + deliveryCharge;
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const savedAddresses = customerProfile?.addresses || [];

  const handlePrepareQuickOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateCustomerDetails(customer);
    if (validationError) {
      setQuickOrderError(validationError);
      return;
    }
    setQuickOrderError('');
    const orderRef = generateOrderRef();
    const message = formatQuickSingleOrderMessage({
      orderRef,
      productName: product.name,
      colorway: product.colorway,
      size: selectedSize,
      quantity,
      unitPrice: product.price,
      settings,
      displayCurrency,
      customer,
    });
    const whatsappUrl = buildWhatsAppUrl(settings.whatsappNumber, message);

    if (currentUser) {
      void saveCustomerOrderToCloud({
        user: currentUser,
        orderRef,
        items: [
          {
            productId: product.id,
            name: product.name,
            colorway: product.colorway,
            size: selectedSize,
            price: product.price,
            image: product.image,
            quantity,
          },
        ],
        subtotal,
        shipping: deliveryCharge,
        total: totalBill,
        currency: displayCurrency,
        displayTotalFormatted: formatConvertedCurrency(
          totalBill,
          displayCurrency,
          settings
        ),
        deliveryDetails: customer,
      }).catch(() => {
        // Error already reported by handleFirestoreError
      });
    }

    setPreparedQuickOrder({ message, whatsappUrl });
  };

  const handleCopyQuickOrder = async () => {
    if (!preparedQuickOrder) return;
    try {
      await navigator.clipboard.writeText(preparedQuickOrder.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleAdd = () => {
    onAddToBag(product, selectedSize, quantity);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#02042B]/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white border border-[#E1E5EE] rounded-xl shadow-2xl grid grid-cols-1 md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product details"
          className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-lg bg-white/95 border border-[#E1E5EE] text-[#0A1045] hover:bg-[#F1F3F8] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066]"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="bg-[#F1F3F8] aspect-[4/3] md:aspect-auto md:h-full min-h-[280px]">
          <ResilientImage
            src={product.image}
            alt={`${product.name} in ${product.colorway}`}
            fallbackLabel={product.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#59607A] uppercase tracking-wider font-medium mb-2">
              <span>{product.category}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#8E6B2E] font-semibold">{product.tier}</span>
              <span aria-hidden="true">·</span>
              <span>{product.colorway}</span>
            </div>

            <h2
              id="pdp-title"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#0A1045] leading-tight mb-2"
            >
              {product.name}
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-[#EEF0F6]">
              <div>
                <p className="font-mono-tabular text-xl font-semibold text-[#000066]">
                  {formatConvertedCurrency(product.price, displayCurrency, settings)}
                </p>
                {displayCurrency !== 'BDT' && (
                  <p className="font-mono-tabular text-xs text-[#59607A]">
                    Base price: {formatConvertedCurrency(product.price, 'BDT', settings)}
                  </p>
                )}
              </div>

              <div
                role="group"
                aria-label="Convert garment price currency"
                className="inline-flex items-center gap-1 p-1 bg-[#F1F3F8] border border-[#E1E5EE] rounded-lg"
              >
                {CURRENCY_OPTIONS.map((opt) => {
                  const active = displayCurrency === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => onChangeCurrency(opt.code)}
                      className={`px-2 py-1 text-[11px] font-mono-tabular font-medium rounded transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#000066] text-white'
                          : 'text-[#434963] hover:text-[#000066]'
                      }`}
                    >
                      {opt.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm text-[#434963] leading-relaxed mb-5">
              {product.description}
            </p>

            {product.specs.length > 0 && (
              <ul className="space-y-1.5 text-xs text-[#59607A] border-t border-[#E1E5EE] pt-4 mb-6">
                {product.specs.map((spec) => (
                  <li key={spec} className="flex items-baseline gap-2">
                    <span className="text-[#C5A467]" aria-hidden="true">
                      —
                    </span>
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[#59607A]">
                  Select Size
                </label>

                {chart && (
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide((prev) => !prev)}
                    aria-expanded={showSizeGuide}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#000066] hover:text-[#8E6B2E] transition-colors cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{showSizeGuide ? 'Hide Size Chart' : 'Size Chart'}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {availableSizes.map((size) => {
                  const isSelected = selectedSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`h-10 px-2 text-xs font-mono-tabular font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066] ${
                        isSelected
                          ? 'bg-[#000066] text-white border-[#000066]'
                          : 'bg-white text-[#0A1045] border-[#D3D8E6] hover:border-[#000066]'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              {showSizeGuide && chart && (
                <div className="mt-4 p-3.5 bg-[#F7F8FB] border border-[#E1E5EE] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#0A1045]">
                      {chart.label} Measurements ({chart.unit})
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#E1E5EE] text-[#59607A]">
                          <th className="py-1.5 pr-3 font-medium">Size</th>
                          {chart.columns.map((col, colIdx) => (
                            <th key={`${col}-${colIdx}`} className="py-1.5 px-2 font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0F6]">
                        {chart.rows.map((row, rowIdx) => (
                          <tr key={`${row.size}-${rowIdx}`}>
                            <td className="py-1.5 pr-3 font-mono-tabular font-medium text-[#0A1045] whitespace-nowrap">
                              {row.size}
                            </td>
                            {row.values.map((val, idx) => (
                              <td
                                key={`${row.size}-${rowIdx}-${idx}`}
                                className="py-1.5 px-2 font-mono-tabular text-[#434963] whitespace-nowrap"
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {chart.note && (
                    <p className="mt-2 text-[11px] text-[#59607A] leading-snug">
                      {chart.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#E1E5EE]">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center border border-[#D3D8E6] rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="w-10 h-10 flex items-center justify-center text-[#0A1045] hover:bg-[#F1F3F8] rounded-l-lg cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center font-mono-tabular text-sm font-medium">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                  className="w-10 h-10 flex items-center justify-center text-[#0A1045] hover:bg-[#F1F3F8] rounded-r-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 h-10 px-5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066]"
              >
                Add Size {selectedSize} ·{' '}
                {formatConvertedCurrency(subtotal, displayCurrency, settings)}
              </button>
            </div>

            {!showQuickOrderForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowQuickOrderForm(true);
                  setPreparedQuickOrder(null);
                  setQuickOrderError('');
                }}
                className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467]"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2} />
                <span>
                  Quick Order Size {selectedSize} ·{' '}
                  {formatConvertedCurrency(totalBill, displayCurrency, settings)}
                </span>
              </button>
            ) : preparedQuickOrder ? (
              <div className="p-4 bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8E6B2E]">
                    Quick Order Ready for WhatsApp
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreparedQuickOrder(null)}
                    className="text-xs font-semibold text-[#000066] hover:underline cursor-pointer"
                  >
                    Edit Details
                  </button>
                </div>

                <pre className="p-3 bg-white border border-[#E1E5EE] rounded-lg text-[11px] text-[#262B47] whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                  {preparedQuickOrder.message}
                </pre>

                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href={preparedQuickOrder.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2} />
                    <span>Send on WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyQuickOrder}
                    className="h-10 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#0A1045] bg-white border border-[#D3D8E6] hover:bg-[#F1F3F8] rounded-lg transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#156142]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handlePrepareQuickOrder}
                className="p-4 bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#0A1045]">
                    Customer &amp; Delivery Details
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQuickOrderForm(false)}
                    className="text-xs text-[#59607A] hover:text-[#0A1045] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {!currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount('profile');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#000066] hover:underline cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#8E6B2E]" />
                    <span>Sign in via OTP to auto-fill &amp; save to Order History</span>
                  </button>
                )}

                {savedAddresses.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-[#59607A] inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#8E6B2E]" />
                      <span>Saved Locations:</span>
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
                            className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
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

                {quickOrderError && (
                  <p
                    role="alert"
                    className="p-2.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                  >
                    {quickOrderError}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="quick-order-name"
                      className="block text-[11px] font-medium text-[#434963] mb-1"
                    >
                      Customer Name *
                    </label>
                    <input
                      id="quick-order-name"
                      type="text"
                      required
                      value={customer.fullName}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, fullName: e.target.value })
                      }
                      placeholder="Farhan Rahman"
                      className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quick-order-phone"
                      className="block text-[11px] font-medium text-[#434963] mb-1"
                    >
                      Contact No. *
                    </label>
                    <input
                      id="quick-order-phone"
                      type="tel"
                      required
                      value={customer.phone}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, phone: e.target.value })
                      }
                      placeholder="+880 17..."
                      className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="quick-order-address"
                    className="block text-[11px] font-medium text-[#434963] mb-1"
                  >
                    Address (House, Road, Area) *
                  </label>
                  <input
                    id="quick-order-address"
                    type="text"
                    required
                    value={customer.streetAddress}
                    onChange={(e) =>
                      onChangeCustomer({
                        ...customer,
                        streetAddress: e.target.value,
                      })
                    }
                    placeholder="House 14, Road 6, Banani"
                    className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="quick-order-thana"
                      className="block text-[11px] font-medium text-[#434963] mb-1"
                    >
                      Thana *
                    </label>
                    <input
                      id="quick-order-thana"
                      type="text"
                      required
                      value={customer.thana}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, thana: e.target.value })
                      }
                      placeholder="Thana"
                      className="w-full h-9 px-2 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quick-order-zilla"
                      className="block text-[11px] font-medium text-[#434963] mb-1"
                    >
                      Zilla *
                    </label>
                    <input
                      id="quick-order-zilla"
                      type="text"
                      required
                      value={customer.zilla}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, zilla: e.target.value })
                      }
                      placeholder="Zilla"
                      className="w-full h-9 px-2 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quick-order-district"
                      className="block text-[11px] font-medium text-[#434963] mb-1"
                    >
                      District *
                    </label>
                    <input
                      id="quick-order-district"
                      type="text"
                      required
                      value={customer.district}
                      onChange={(e) =>
                        onChangeCustomer({ ...customer, district: e.target.value })
                      }
                      placeholder="District"
                      className="w-full h-9 px-2 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="quick-order-note"
                    className="block text-[11px] font-medium text-[#434963] mb-1"
                  >
                    Note to Us (Optional)
                  </label>
                  <textarea
                    id="quick-order-note"
                    rows={2}
                    value={customer.notes}
                    onChange={(e) =>
                      onChangeCustomer({ ...customer, notes: e.target.value })
                    }
                    placeholder="Share anything specific—fit preference, delivery timing, or special request..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2} />
                  <span>
                    Continue to WhatsApp ·{' '}
                    {formatConvertedCurrency(totalBill, displayCurrency, settings)}
                  </span>
                </button>
              </form>
            )}

            <p className="text-[11px] text-center text-[#59607A] font-mono-tabular">
              Subtotal {formatConvertedCurrency(subtotal, displayCurrency, settings)} + Delivery{' '}
              {deliveryCharge === 0
                ? 'Free'
                : formatConvertedCurrency(deliveryCharge, displayCurrency, settings)}{' '}
              = Total {formatConvertedCurrency(totalBill, displayCurrency, settings)}
            </p>
          </div>
        </div>

        {/* Customer Reviews Section */}
        <div className="md:col-span-2 border-t border-[#E1E5EE] bg-[#F7F8FB] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-1">
                Verified Feedback
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#0A1045]">
                Customer Reviews
              </h3>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-2 bg-white border border-[#E1E5EE] rounded-lg self-start sm:self-auto">
              <div className="flex items-center gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= Math.round(averageRating)
                        ? 'text-[#C5A467] fill-[#C5A467]'
                        : 'text-[#D3D8E6]'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-[#0A1045]">
                {reviews.length > 0 ? averageRating.toFixed(1) : '—'} / 5
              </span>
              <span className="text-xs text-[#59607A]">
                ({reviews.length} review{reviews.length === 1 ? '' : 's'})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setReviewError('');
                setReviewSuccess('');
                if (!currentUser) {
                  setReviewError('Please sign in with Google to submit your review.');
                  return;
                }
                if (!reviewComment.trim()) {
                  setReviewError('Please write a short feedback comment.');
                  return;
                }
                setIsSubmittingReview(true);
                try {
                  await addProductReviewToCloud({
                    productId: product.id,
                    authorId: currentUser.uid,
                    authorName:
                      reviewerName.trim() ||
                      currentUser.displayName ||
                      'Verified Customer',
                    rating: reviewRating,
                    comment: reviewComment.trim(),
                  });
                  setReviewComment('');
                  setReviewRating(5);
                  setReviewSuccess('Thank you — your review is now live.');
                  window.setTimeout(() => setReviewSuccess(''), 3000);
                } catch (err) {
                  setReviewError(
                    err instanceof Error && !err.message.startsWith('{')
                      ? err.message
                      : 'Could not submit your review. Please try again.'
                  );
                } finally {
                  setIsSubmittingReview(false);
                }
              }}
              className="md:col-span-5 p-4 sm:p-5 bg-white border border-[#E1E5EE] rounded-xl space-y-3.5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0A1045]">
                Leave a Review
              </p>

              {reviewError && (
                <p
                  role="alert"
                  className="p-2.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                >
                  {reviewError}
                </p>
              )}

              {reviewSuccess && (
                <p className="p-2.5 text-xs font-medium text-[#156142] bg-[#156142]/10 rounded-lg">
                  {reviewSuccess}
                </p>
              )}

              <div>
                <span className="block text-[11px] font-medium text-[#434963] mb-1.5">
                  Star Rating *
                </span>
                <div
                  className="inline-flex items-center gap-1"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= (hoverRating || reviewRating);
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        aria-label={`Rate ${star} out of 5 stars`}
                        className="p-1 rounded hover:bg-[#F7F8FB] transition-colors cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            active
                              ? 'text-[#C5A467] fill-[#C5A467]'
                              : 'text-[#CBD2E1]'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="ml-2 font-mono-tabular text-xs font-medium text-[#59607A]">
                    {reviewRating} / 5
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="review-author-name"
                  className="block text-[11px] font-medium text-[#434963] mb-1"
                >
                  Your Name *
                </label>
                <input
                  id="review-author-name"
                  type="text"
                  maxLength={80}
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full h-9 px-3 text-xs bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="review-comment"
                    className="block text-[11px] font-medium text-[#434963]"
                  >
                    Your Feedback *
                  </label>
                  <span className="font-mono-tabular text-[10px] text-[#737B96]">
                    {reviewComment.length}/500
                  </span>
                </div>
                <textarea
                  id="review-comment"
                  rows={3}
                  maxLength={500}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share how the fabric, stitching, and fit felt..."
                  className="w-full px-3 py-2 text-xs bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              {!currentUser ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount('profile');
                    }}
                    className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Sign in with Phone OTP to Post Review</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSigningInForReview}
                    onClick={async () => {
                      setReviewError('');
                      setIsSigningInForReview(true);
                      try {
                        await onSignInForReview();
                      } catch {
                        setReviewError(
                          'Google sign-in was cancelled or blocked. Please allow popups and try again.'
                        );
                      } finally {
                        setIsSigningInForReview(false);
                      }
                    }}
                    className="w-full h-9 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5 text-[#D9BC82]" />
                    <span>
                      {isSigningInForReview
                        ? 'Signing in...'
                        : 'Or Sign in with Google'}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="w-full h-10 px-4 text-xs font-semibold text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {isSubmittingReview ? 'Posting Review...' : 'Submit Review'}
                </button>
              )}
            </form>

            <div className="md:col-span-7 space-y-3">
              {reviewsLoading ? (
                <div className="p-6 text-center bg-white border border-[#E1E5EE] rounded-xl text-xs text-[#59607A]">
                  Loading reviews...
                </div>
              ) : reviews.length === 0 ? (
                <div className="p-6 text-center bg-white border border-[#E1E5EE] rounded-xl">
                  <p className="text-sm font-medium text-[#0A1045] mb-1">
                    No customer reviews yet
                  </p>
                  <p className="text-xs text-[#59607A]">
                    Be the first to rate this piece and share short feedback.
                  </p>
                </div>
              ) : (
                reviews.map((rev) => {
                  const canDelete =
                    isOwner || (currentUser && currentUser.uid === rev.authorId);
                  return (
                    <div
                      key={rev.id}
                      className="p-4 bg-white border border-[#E1E5EE] rounded-xl space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-[#0A1045]">
                              {rev.authorName}
                            </span>
                            <span className="text-[11px] text-[#737B96]">
                              {new Date(rev.createdAtMs).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-0.5 mt-1"
                            aria-label={`${rev.rating} out of 5 stars`}
                          >
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3.5 h-3.5 ${
                                  star <= rev.rating
                                    ? 'text-[#C5A467] fill-[#C5A467]'
                                    : 'text-[#E1E5EE]'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              void removeProductReviewFromCloud(product.id, rev.id)
                            }
                            aria-label={`Delete review by ${rev.authorName}`}
                            className="p-1.5 text-[#8890A8] hover:text-[#B91C1C] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-[#434963] leading-relaxed whitespace-pre-wrap">
                        {rev.comment}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
