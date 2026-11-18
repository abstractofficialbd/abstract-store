/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  LogIn,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  Ruler,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { CartDrawer } from './components/CartDrawer';
import {
  CustomerAccountModal,
  CustomerAccountTab,
} from './components/CustomerAccountModal';
import { BRAND_LOGO_PATH, Header } from './components/Header';
import { OrderStatusHelper } from './components/OrderStatusHelper';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { ResilientImage } from './components/ResilientImage';
import {
  SettingsModalTab,
  ShopSettingsModal,
} from './components/ShopSettingsModal';
import {
  CATEGORIES,
  CURRENCY_OPTIONS,
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_SIZE_CHARTS,
  getSizeChartKeyForCategory,
  INITIAL_PRODUCTS,
} from './data/catalog';
import {
  OWNER_EMAIL,
  OperationType,
  addProductToCloud,
  auth,
  checkUserIsAdmin,
  db,
  handleFirestoreError,
  removeProductFromCloud,
  resetAllStoreDataInCloud,
  saveSizeChartsToCloud,
  saveStoreConfigToCloud,
  signInOwnerWithGoogle,
  signOutOwner,
} from './lib/firebase';
import {
  CartItem,
  CustomerDetails,
  CustomerOrder,
  CustomerProfile,
  DisplayCurrency,
  Product,
  ProductCategory,
  SavedAddress,
  ShopSettings,
  SizeChart,
  SizeChartGroupKey,
} from './types/shop';
import { buildWhatsAppUrl, formatConvertedCurrency } from './utils/whatsapp';

const STORAGE_CART_KEY = 'abstract_bd_cart_v1';
const STORAGE_CURRENCY_KEY = 'abstract_bd_currency_v1';
const VALID_CHART_KEYS: SizeChartGroupKey[] = [
  'panjabis',
  'tops_shirts',
  'outerwear',
  'trousers_denim',
];

type SortOrder = 'featured' | 'price-asc' | 'price-desc';

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeExternalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function App() {
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>(() =>
    loadStored(STORAGE_CART_KEY, [])
  );
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({
    fullName: '',
    phone: '',
    streetAddress: '',
    thana: '',
    zilla: '',
    district: '',
    paymentMethod: 'Cash on Delivery',
    notes: '',
  });
  const [sizeCharts, setSizeCharts] =
    useState<Record<SizeChartGroupKey, SizeChart>>(DEFAULT_SIZE_CHARTS);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() =>
    loadStored<DisplayCurrency>(STORAGE_CURRENCY_KEY, 'BDT')
  );
  const [converterBdt, setConverterBdt] = useState<string>('1000');

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('featured');

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsModalTab>('shop');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [attemptedOwnerLogin, setAttemptedOwnerLogin] = useState(false);
  const [authError, setAuthError] = useState('');

  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(
    null
  );
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] =
    useState<CustomerAccountTab>('profile');

  const openSettingsModal = (tab: SettingsModalTab = 'shop') => {
    if (!isOwner) return;
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  const openCustomerAccount = (tab: CustomerAccountTab = 'profile') => {
    setAccountInitialTab(tab);
    setIsAccountOpen(true);
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setCurrentUser(user);
      setAuthError('');
      if (!user) {
        setIsOwner(false);
        setIsSettingsOpen(false);
        return;
      }
      const admin = await checkUserIsAdmin(user);
      if (!active) return;
      setIsOwner(admin);
      if (!admin) {
        setIsSettingsOpen(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const isVerifiedCustomer = Boolean(
      currentUser && (currentUser.emailVerified || currentUser.phoneNumber)
    );
    if (!currentUser || !isVerifiedCustomer) {
      setCustomerProfile(null);
      setCustomerOrders([]);
      setCustomerOrdersLoading(false);
      return;
    }

    setCustomerOrdersLoading(true);

    const unsubProfile = onSnapshot(
      doc(db, 'customers', currentUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setCustomerProfile(null);
          return;
        }
        const data = snap.data();
        const rawAddresses = Array.isArray(data.addresses) ? data.addresses : [];
        const addresses: SavedAddress[] = rawAddresses
          .slice(0, 3)
          .map((addr: Record<string, unknown>, idx: number) => ({
            id: String(addr?.id || `addr-${idx}`),
            label: String(addr?.label || `Location ${idx + 1}`),
            streetAddress: String(addr?.streetAddress || ''),
            thana: String(addr?.thana || ''),
            zilla: String(addr?.zilla || ''),
            district: String(addr?.district || ''),
            isDefault: Boolean(addr?.isDefault),
          }));

        const loadedProfile: CustomerProfile = {
          uid: String(data.uid || currentUser.uid),
          fullName: String(data.fullName || ''),
          phoneNumber: String(
            data.phoneNumber || currentUser.phoneNumber || ''
          ),
          email: String(data.email || currentUser.email || ''),
          photoUrl: String(data.photoUrl || ''),
          addresses,
        };
        setCustomerProfile(loadedProfile);

        const defaultAddr =
          addresses.find((a) => a.isDefault) || addresses[0] || null;
        setCustomerDetails((prev) => ({
          ...prev,
          fullName: prev.fullName.trim()
            ? prev.fullName
            : loadedProfile.fullName || prev.fullName,
          phone: prev.phone.trim()
            ? prev.phone
            : loadedProfile.phoneNumber &&
              loadedProfile.phoneNumber !== 'Pending'
            ? loadedProfile.phoneNumber
            : prev.phone,
          streetAddress: prev.streetAddress.trim()
            ? prev.streetAddress
            : defaultAddr?.streetAddress || prev.streetAddress,
          thana: prev.thana.trim()
            ? prev.thana
            : defaultAddr?.thana || prev.thana,
          zilla: prev.zilla.trim()
            ? prev.zilla
            : defaultAddr?.zilla || prev.zilla,
          district: prev.district.trim()
            ? prev.district
            : defaultAddr?.district || prev.district,
        }));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.GET,
          `customers/${currentUser.uid}`
        )
    );

    const ordersQuery = query(
      collection(db, 'customers', currentUser.uid, 'orders'),
      orderBy('createdAt', 'desc')
    );
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const nextOrders: CustomerOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as { toMillis?: () => number } | null;
          const del = (data.deliveryDetails || {}) as Record<string, unknown>;
          const rawItems = Array.isArray(data.items) ? data.items : [];
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            orderRef: String(data.orderRef || d.id),
            customerId: String(data.customerId || currentUser.uid),
            items: rawItems.map((it: Record<string, unknown>) => ({
              productId: String(it?.productId || ''),
              name: String(it?.name || 'Garment'),
              colorway: String(it?.colorway || ''),
              size: String(it?.size || 'M'),
              price: Number(it?.price) || 0,
              image: String(it?.image || ''),
              quantity: Math.max(1, Number(it?.quantity) || 1),
            })),
            subtotal: Number(data.subtotal) || 0,
            shipping: Number(data.shipping) || 0,
            total: Number(data.total) || 0,
            currency: (['BDT', 'USD', 'EUR', 'AED'].includes(
              String(data.currency)
            )
              ? data.currency
              : 'BDT') as DisplayCurrency,
            displayTotalFormatted: String(data.displayTotalFormatted || '৳0'),
            deliveryDetails: {
              fullName: String(del.fullName || ''),
              phone: String(del.phone || ''),
              streetAddress: String(del.streetAddress || ''),
              thana: String(del.thana || ''),
              zilla: String(del.zilla || ''),
              district: String(del.district || ''),
              paymentMethod: (del.paymentMethod ||
                'Cash on Delivery') as CustomerDetails['paymentMethod'],
              notes: String(del.notes || ''),
            },
            status: String(
              data.status || 'Sent via WhatsApp'
            ) as CustomerOrder['status'],
            createdAtMs:
              ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now(),
          };
        });
        setCustomerOrders(nextOrders);
        setCustomerOrdersLoading(false);
      },
      (err) => {
        setCustomerOrdersLoading(false);
        handleFirestoreError(
          err,
          OperationType.LIST,
          `customers/${currentUser.uid}/orders`
        );
      }
    );

    return () => {
      unsubProfile();
      unsubOrders();
    };
  }, [currentUser]);

  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, 'storeConfig', 'main'),
      (snap) => {
        if (!snap.exists()) {
          setSettings(DEFAULT_SHOP_SETTINGS);
          return;
        }
        const data = snap.data() as Partial<ShopSettings>;
        setSettings({
          ...DEFAULT_SHOP_SETTINGS,
          ...data,
          heroBanner: {
            ...DEFAULT_SHOP_SETTINGS.heroBanner,
            ...(data.heroBanner || {}),
          },
          exchangeRates: {
            ...DEFAULT_SHOP_SETTINGS.exchangeRates,
            ...(data.exchangeRates || {}),
          },
        });
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'storeConfig/main')
    );

    const unsubProducts = onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const nextProducts: Product[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            name: String(data.name || ''),
            category: data.category as Product['category'],
            tier: data.tier as Product['tier'],
            price: Number(data.price) || 0,
            image: String(data.image || ''),
            colorway: String(data.colorway || ''),
            availability: data.availability === 'Limited' ? 'Limited' : 'In Stock',
            description: String(data.description || ''),
            specs: Array.isArray(data.specs) ? data.specs.map(String) : [],
            sizes: Array.isArray(data.sizes) ? data.sizes.map(String) : ['M'],
          };
        });
        setProducts(nextProducts);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubCharts = onSnapshot(
      collection(db, 'sizeCharts'),
      (snapshot) => {
        const nextCharts: Record<SizeChartGroupKey, SizeChart> = {
          ...DEFAULT_SIZE_CHARTS,
        };
        snapshot.docs.forEach((d) => {
          const chartKey = d.id as SizeChartGroupKey;
          if (!VALID_CHART_KEYS.includes(chartKey)) return;
          const data = d.data() as Partial<SizeChart>;
          const base = DEFAULT_SIZE_CHARTS[chartKey];
          nextCharts[chartKey] = {
            ...base,
            ...data,
            key: chartKey,
            unit: data.unit === 'cm' ? 'cm' : 'inches',
            columns:
              Array.isArray(data.columns) && data.columns.length > 0
                ? data.columns.map(String)
                : base.columns,
            rows:
              Array.isArray(data.rows) && data.rows.length > 0
                ? data.rows.map((r) => ({
                    size: String(r.size || 'M'),
                    values: Array.isArray(r.values) ? r.values.map(String) : [],
                  }))
                : base.rows,
          };
        });
        setSizeCharts(nextCharts);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sizeCharts')
    );

    return () => {
      unsubConfig();
      unsubProducts();
      unsubCharts();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_CURRENCY_KEY,
        JSON.stringify(displayCurrency)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [displayCurrency]);

  useEffect(() => {
    document.title = `${settings.shopName} — Men's Fashion Wear & WhatsApp Shop`;
  }, [settings.shopName]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matches = products.filter((product) => {
      const categoryMatch =
        selectedCategory === 'All' || product.category === selectedCategory;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      return (
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.tier.toLowerCase().includes(normalizedQuery) ||
        product.colorway.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery)
      );
    });

    if (sortOrder === 'price-asc') {
      return [...matches].sort((a, b) => a.price - b.price);
    }
    if (sortOrder === 'price-desc') {
      return [...matches].sort((a, b) => b.price - a.price);
    }
    return matches;
  }, [products, selectedCategory, searchQuery, sortOrder]);

  const totalBagCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleAddToBag = (product: Product, size: string, quantity = 1) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === product.id && item.size === size
      );
      if (existingIndex >= 0) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          colorway: product.colorway,
          size,
          price: product.price,
          image: product.image,
          quantity,
        },
      ];
    });
  };

  const handleUpdateQuantity = (
    productId: string,
    size: string,
    delta: number
  ) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.size === size
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (productId: string, size: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.productId === productId && item.size === size))
    );
  };

  const handleClearCart = () => setCart([]);

  const handleOwnerSignIn = async () => {
    setAuthError('');
    setAttemptedOwnerLogin(true);
    setIsSigningIn(true);
    try {
      await signInOwnerWithGoogle();
    } catch {
      setAuthError('Sign-in was cancelled or blocked. Please allow popups and try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCustomerSignIn = async () => {
    setAuthError('');
    setAttemptedOwnerLogin(false);
    await signInOwnerWithGoogle();
  };

  const handleOwnerSignOut = async () => {
    setAuthError('');
    setAttemptedOwnerLogin(false);
    setIsSettingsOpen(false);
    await signOutOwner();
  };

  const handleSaveSettings = async (nextSettings: ShopSettings) => {
    if (!isOwner || !currentUser) {
      throw new Error('Owner authentication required.');
    }
    await saveStoreConfigToCloud(nextSettings, currentUser.uid);
  };

  const handleSaveSizeCharts = async (
    nextCharts: Record<SizeChartGroupKey, SizeChart>
  ) => {
    if (!isOwner || !currentUser) {
      throw new Error('Owner authentication required.');
    }
    await saveSizeChartsToCloud(nextCharts, currentUser.uid);
  };

  const handleAddProduct = async (product: Product) => {
    if (!isOwner || !currentUser) {
      throw new Error('Owner authentication required.');
    }
    await addProductToCloud(product, currentUser.uid);
    setSelectedCategory('All');
  };

  const handleRemoveProduct = async (productId: string) => {
    if (!isOwner || !currentUser) {
      throw new Error('Owner authentication required.');
    }
    await removeProductFromCloud(productId);
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    if (activeProduct?.id === productId) {
      setActiveProduct(null);
    }
  };

  const handleResetDefaults = async () => {
    if (!isOwner || !currentUser) {
      throw new Error('Owner authentication required.');
    }
    await resetAllStoreDataInCloud(
      DEFAULT_SHOP_SETTINGS,
      DEFAULT_SIZE_CHARTS,
      products,
      currentUser.uid
    );
  };

  const directInquiryUrl = buildWhatsAppUrl(
    settings.whatsappNumber,
    `Assalamu Alaikum / Hi ${settings.shopName}! I would like assistance with sizing or placing an order.`
  );

  const socialLinks = [
    {
      id: 'facebook',
      name: 'Facebook',
      subtitle: 'Latest drops, lookbooks & inbox support',
      href: normalizeExternalUrl(settings.facebookUrl),
    },
    {
      id: 'instagram',
      name: 'Instagram',
      subtitle: 'Editorial reels & styling inspiration',
      href: normalizeExternalUrl(settings.instagramUrl),
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      subtitle: 'Behind-the-scenes fit checks & showcases',
      href: normalizeExternalUrl(settings.tiktokUrl),
    },
  ].filter((link) => Boolean(link.href));

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F7F8FB] text-[#0A1045]">
      <Header
        shopName={settings.shopName}
        cartCount={totalBagCount}
        isCustomerSignedIn={Boolean(currentUser)}
        customerProfile={customerProfile}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={openCustomerAccount}
        onSelectCategory={setSelectedCategory}
      />

      <main className="flex-1">
        {/* Section 1: Clean, Editable Editorial Hero */}
        <section className="relative w-full min-h-[480px] lg:h-[560px] bg-[#141416] overflow-hidden">
          <ResilientImage
            src={settings.heroBanner.image}
            alt={settings.heroBanner.headline || settings.shopName}
            fallbackLabel={settings.shopName}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-100"
          />

          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent"
          />

          {isOwner && (
            <button
              type="button"
              onClick={() => openSettingsModal('banner')}
              className="absolute top-4 right-4 sm:top-6 sm:right-8 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-black/50 hover:bg-black/75 border border-white/25 rounded-lg backdrop-blur-sm transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#D9BC82]" />
              <span>Edit Banner</span>
            </button>
          )}

          <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 h-full min-h-[480px] lg:min-h-[560px] flex flex-col justify-end pb-12 pt-16 md:justify-center md:py-16">
            <div className="max-w-xl">
              {settings.heroBanner.eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D9BC82] mb-4">
                  {settings.heroBanner.eyebrow}
                </p>
              )}

              <h1 className="font-display text-[clamp(2.5rem,4.5vw,3.9rem)] font-semibold leading-[1.04] tracking-tight text-white text-balance mb-5">
                {settings.heroBanner.headline}
              </h1>

              <p className="text-[15px] sm:text-base text-white/85 leading-relaxed max-w-md mb-8">
                {settings.heroBanner.subtext}
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#catalog"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <span>{settings.heroBanner.ctaLabel || 'Explore Collection'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </a>

                <a
                  href={directInquiryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-black/35 hover:bg-black/55 border border-white/30 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4 text-[#D9BC82]" strokeWidth={1.75} />
                  <span>Order on WhatsApp</span>
                </a>
              </div>

              {settings.freeShippingThreshold > 0 && (
                <p className="mt-8 text-xs text-white/75">
                  Complimentary delivery over{' '}
                  <span className="font-mono-tabular font-semibold text-[#D9BC82]">
                    {formatConvertedCurrency(
                      settings.freeShippingThreshold,
                      displayCurrency,
                      settings
                    )}
                  </span>{' '}
                  · Cash on Delivery &amp; bKash / Nagad accepted.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Filterable Men's Fashion Catalog */}
        <section id="catalog" className="bg-white py-14 md:py-20">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-1.5">
                  Curated Menswear
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#0A1045] tracking-tight">
                  The Collection
                </h2>
                <p className="text-sm text-[#59607A] mt-1">
                  Select any piece to inspect fabric details, check the size chart, or
                  order immediately via WhatsApp.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono-tabular text-xs text-[#59607A] mr-1">
                  {filteredProducts.length} piece
                  {filteredProducts.length === 1 ? '' : 's'}
                </span>
                {isOwner && (
                  <>
                    <button
                      type="button"
                      onClick={() => openSettingsModal('sizes')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0A1045] bg-[#F7F8FB] border border-[#D3D8E6] hover:border-[#000066] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Ruler className="w-3.5 h-3.5 text-[#8E6B2E]" />
                      <span>Edit Size Charts</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettingsModal('product')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Product</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-9">
              <div
                role="tablist"
                aria-label="Filter menswear by category"
                className="flex items-center gap-1 p-1 bg-[#F1F3F8] border border-[#E1E5EE] rounded-lg overflow-x-auto"
              >
                {CATEGORIES.map((category) => {
                  const isActive = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066] ${
                        isActive
                          ? 'bg-[#000066] text-white shadow-sm'
                          : 'text-[#434963] hover:text-[#000066]'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="relative flex-1 sm:w-56">
                  <Search
                    className="w-4 h-4 text-[#737B96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.75}
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Panjabi, Polo, Denim..."
                    aria-label="Search menswear"
                    className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <select
                  aria-label="Sort products"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="h-10 px-3 text-xs font-medium bg-white border border-[#D3D8E6] rounded-lg text-[#0A1045] focus:outline-none focus:border-[#000066] cursor-pointer"
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Pricing & Currency Converter Strip */}
            <div className="mb-9 p-4 sm:p-5 bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0A1045]">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-[#8E6B2E]" />
                  <span>Store Currency:</span>
                </div>
                <div
                  role="group"
                  aria-label="Select storefront pricing currency"
                  className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#D3D8E6] rounded-lg"
                >
                  {CURRENCY_OPTIONS.map((opt) => {
                    const active = displayCurrency === opt.code;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => setDisplayCurrency(opt.code)}
                        className={`px-3 py-1.5 text-xs font-mono-tabular font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#000066] text-white shadow-sm'
                            : 'text-[#434963] hover:text-[#000066]'
                        }`}
                      >
                        {opt.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#E1E5EE]">
                <label
                  htmlFor="taka-converter-input"
                  className="text-xs font-medium text-[#59607A] whitespace-nowrap"
                >
                  Convert Taka (৳):
                </label>
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono-tabular text-[#59607A]">
                    ৳
                  </span>
                  <input
                    id="taka-converter-input"
                    type="number"
                    min="0"
                    value={converterBdt}
                    onChange={(e) => setConverterBdt(e.target.value)}
                    placeholder="1000"
                    className="w-full h-9 pl-6 pr-2 text-xs font-mono-tabular font-medium bg-white border border-[#D3D8E6] rounded-lg text-[#0A1045] focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono-tabular text-xs">
                  <span className="px-2.5 py-1.5 bg-white border border-[#E1E5EE] rounded-md text-[#0A1045]">
                    {formatConvertedCurrency(
                      Math.max(0, Number(converterBdt) || 0),
                      'USD',
                      settings
                    )}{' '}
                    <span className="text-[10px] text-[#59607A]">USD</span>
                  </span>
                  <span className="px-2.5 py-1.5 bg-white border border-[#E1E5EE] rounded-md text-[#0A1045]">
                    {formatConvertedCurrency(
                      Math.max(0, Number(converterBdt) || 0),
                      'EUR',
                      settings
                    )}{' '}
                    <span className="text-[10px] text-[#59607A]">EUR</span>
                  </span>
                  <span className="px-2.5 py-1.5 bg-white border border-[#E1E5EE] rounded-md text-[#0A1045]">
                    {formatConvertedCurrency(
                      Math.max(0, Number(converterBdt) || 0),
                      'AED',
                      settings
                    )}
                  </span>
                </div>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="py-16 px-6 text-center bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl">
                {isOwner ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-2">
                      Ready for Your New Drop
                    </p>
                    <p className="font-display text-3xl text-[#0A1045] mb-2">
                      No garments listed yet
                    </p>
                    <p className="text-sm text-[#59607A] max-w-md mx-auto mb-6">
                      Upload your product photos, set prices, and publish your pieces
                      live to the storefront.
                    </p>
                    <button
                      type="button"
                      onClick={() => openSettingsModal('product')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-[#C5A467]" />
                      <span>Add Your First Product</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-2">
                      Upcoming Release
                    </p>
                    <p className="font-display text-3xl text-[#0A1045] mb-2">
                      New collection dropping soon
                    </p>
                    <p className="text-sm text-[#59607A] max-w-md mx-auto mb-6">
                      Our next batch of tailored garments is being prepared. Reach out on
                      WhatsApp for early sizing inquiries or bespoke requests.
                    </p>
                    <a
                      href={directInquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-4 h-4 text-[#C5A467]" />
                      <span>Message {settings.shopName} on WhatsApp</span>
                    </a>
                  </>
                )}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-16 text-center bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl">
                <p className="font-display text-2xl text-[#0A1045] mb-2">
                  No matching garments found
                </p>
                <p className="text-sm text-[#59607A] mb-5">
                  Clear your search or switch back to view the entire collection.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#000066] rounded-lg hover:bg-[#091285] cursor-pointer"
                >
                  Show All Pieces
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
                {filteredProducts.map((product) => {
                  const chart =
                    sizeCharts[getSizeChartKeyForCategory(product.category)];
                  const defaultSize =
                    chart?.rows[1]?.size || chart?.rows[0]?.size;
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      settings={settings}
                      displayCurrency={displayCurrency}
                      defaultSize={defaultSize}
                      onSelectProduct={setActiveProduct}
                      onQuickAdd={(p, size) => handleAddToBag(p, size, 1)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Ordering Steps & Order Tracking */}
        <section
          id="how-to-order"
          className="border-t border-[#E1E5EE] bg-[#F7F8FB] py-16 md:py-20"
        >
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <div className="lg:col-span-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-2">
                  Atelier Service
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#0A1045] tracking-tight mb-4">
                  Quiet luxury, direct WhatsApp service.
                </h2>
                <p className="text-[15px] text-[#434963] leading-relaxed mb-6">
                  Every {settings.shopName} garment—across our Platinum, Luxury,
                  Premium, and Essential lines—is crafted with disciplined tailoring
                  and long-staple textiles. Place your order straight through WhatsApp
                  for instant size verification and doorstep delivery.
                </p>

                <a
                  href={directInquiryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4 text-[#C5A467]" strokeWidth={1.75} />
                  <span>Chat With {settings.shopName} on WhatsApp</span>
                </a>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="p-6 bg-white border border-[#E1E5EE] rounded-xl">
                  <p className="font-mono-tabular text-xs font-semibold text-[#8E6B2E] mb-2">
                    01.
                  </p>
                  <h3 className="text-base font-semibold text-[#0A1045] mb-1.5">
                    Select Garment &amp; Size
                  </h3>
                  <p className="text-xs text-[#59607A] leading-relaxed">
                    Browse Panjabis, shirts, polos, fleece, outerwear, and denim in
                    tailored sizes.
                  </p>
                </div>

                <div className="p-6 bg-white border border-[#E1E5EE] rounded-xl">
                  <p className="font-mono-tabular text-xs font-semibold text-[#8E6B2E] mb-2">
                    02.
                  </p>
                  <h3 className="text-base font-semibold text-[#0A1045] mb-1.5">
                    Enter Delivery Info
                  </h3>
                  <p className="text-xs text-[#59607A] leading-relaxed">
                    Add your name, mobile number, and address with Cash on Delivery or
                    bKash / Nagad.
                  </p>
                </div>

                <div className="p-6 bg-white border border-[#E1E5EE] rounded-xl">
                  <p className="font-mono-tabular text-xs font-semibold text-[#8E6B2E] mb-2">
                    03.
                  </p>
                  <h3 className="text-base font-semibold text-[#0A1045] mb-1.5">
                    Send on WhatsApp
                  </h3>
                  <p className="text-xs text-[#59607A] leading-relaxed">
                    WhatsApp opens with your itemized order summary ready to send—we
                    confirm dispatch promptly.
                  </p>
                </div>
              </div>
            </div>

            <OrderStatusHelper settings={settings} />
          </div>
        </section>

        {/* Section 4: About Us & Official Social Channels */}
        <section
          id="about"
          className="border-t border-[#E1E5EE] bg-white py-16 md:py-20"
        >
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <div className="lg:col-span-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-2">
                  About {settings.shopName}
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#0A1045] tracking-tight mb-4">
                  Built for discipline, cut for presence.
                </h2>
                <p className="text-[15px] text-[#434963] leading-relaxed max-w-2xl">
                  {settings.aboutText}
                </p>
              </div>

              <div className="lg:col-span-5">
                <div className="p-6 sm:p-7 bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-1.5">
                    Connect With Us
                  </p>
                  <h3 className="font-display text-2xl font-semibold text-[#0A1045] mb-2">
                    Official Socials
                  </h3>
                  <p className="text-xs text-[#59607A] mb-5">
                    Visit our pages for new arrivals, styling reels, and direct community updates.
                  </p>

                  <div className="space-y-3">
                    {socialLinks.map((social) => (
                      <a
                        key={social.id}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-4 p-3.5 bg-white border border-[#E1E5EE] hover:border-[#000066] rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className="w-10 h-10 rounded-lg bg-[#000066] text-[#C5A467] flex items-center justify-center shrink-0">
                            {social.id === 'facebook' && (
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                                aria-hidden="true"
                              >
                                <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2.2H8v3h2.5V21h3z" />
                              </svg>
                            )}
                            {social.id === 'instagram' && (
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-4 h-4"
                                aria-hidden="true"
                              >
                                <rect x="3" y="3" width="18" height="18" rx="5" />
                                <circle cx="12" cy="12" r="4" />
                                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                              </svg>
                            )}
                            {social.id === 'tiktok' && (
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                                aria-hidden="true"
                              >
                                <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.5 2.59 2.59 0 0 1 2.59-2.5c.27 0 .53.04.77.12V9.86a5.7 5.7 0 0 0-.77-.05 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21.2a5.69 5.69 0 0 0 5.69-5.7V9.24a7.33 7.33 0 0 0 4.29 1.38V7.53a4.29 4.29 0 0 1-3.24-1.71z" />
                              </svg>
                            )}
                          </span>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#0A1045] group-hover:text-[#000066]">
                              {social.name}
                            </p>
                            <p className="text-xs text-[#59607A] truncate">
                              {social.subtitle}
                            </p>
                          </div>
                        </div>

                        <ArrowUpRight className="w-4 h-4 text-[#737B96] group-hover:text-[#000066] shrink-0 transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Section 5: Imperial Navy & Matte Gold Footer */}
      <footer className="border-t border-[#C5A467]/35 bg-[#000066] text-white/80">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <img
              src={BRAND_LOGO_PATH}
              alt={settings.shopName}
              referrerPolicy="no-referrer"
              className="h-8 w-24 object-cover object-center"
            />
            <span className="text-white/40" aria-hidden="true">
              ·
            </span>
            <span>
              Men&apos;s Fashion Wear · WhatsApp Orders (+{settings.whatsappNumber})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {socialLinks.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#D9BC82] transition-colors"
              >
                {social.name}
              </a>
            ))}
            <button
              type="button"
              onClick={() => openCustomerAccount('orders')}
              className="hover:text-[#D9BC82] transition-colors cursor-pointer"
            >
              Order History
            </button>
            <a
              href="#order-status"
              className="hover:text-[#D9BC82] transition-colors"
            >
              Order Status
            </a>
            <a
              href={directInquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#D9BC82] transition-colors"
            >
              WhatsApp Support
            </a>
            {!currentUser ? (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={handleOwnerSignIn}
                className="inline-flex items-center gap-1.5 text-[#D9BC82] font-medium hover:text-white disabled:opacity-60 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isSigningIn ? 'Signing in...' : 'Owner Login'}</span>
              </button>
            ) : isOwner ? (
              <div className="inline-flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => openSettingsModal('shop')}
                  className="inline-flex items-center gap-1.5 text-[#D9BC82] font-medium hover:text-white transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Store Owner Setup</span>
                </button>
                <button
                  type="button"
                  onClick={handleOwnerSignOut}
                  className="inline-flex items-center gap-1 text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openCustomerAccount('profile')}
                  className="text-white/85 hover:text-[#D9BC82] transition-colors cursor-pointer"
                  title={
                    attemptedOwnerLogin
                      ? `Only ${OWNER_EMAIL} can edit store content`
                      : 'Open your customer profile'
                  }
                >
                  {attemptedOwnerLogin
                    ? `Signed in as ${currentUser.email || currentUser.phoneNumber || 'account'} — owner access required`
                    : `Signed in as ${
                        customerProfile?.fullName?.trim() ||
                        currentUser.displayName ||
                        currentUser.phoneNumber ||
                        currentUser.email ||
                        'Customer'
                      }`}
                </button>
                <button
                  type="button"
                  onClick={handleOwnerSignOut}
                  className="inline-flex items-center gap-1 text-[#D9BC82] hover:text-white transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {authError && (
          <div className="max-w-7xl mx-auto px-5 sm:px-8 pb-4 text-xs text-[#FDE68A]">
            {authError}
          </div>
        )}
      </footer>

      <ProductDetailModal
        product={activeProduct}
        customer={customerDetails}
        onChangeCustomer={setCustomerDetails}
        settings={settings}
        sizeCharts={sizeCharts}
        displayCurrency={displayCurrency}
        onChangeCurrency={setDisplayCurrency}
        currentUser={currentUser}
        customerProfile={customerProfile}
        isOwner={isOwner}
        onSignInForReview={handleCustomerSignIn}
        onOpenAccount={openCustomerAccount}
        onClose={() => setActiveProduct(null)}
        onAddToBag={handleAddToBag}
      />

      <CartDrawer
        isOpen={isCartOpen}
        items={cart}
        customer={customerDetails}
        onChangeCustomer={setCustomerDetails}
        settings={settings}
        displayCurrency={displayCurrency}
        onChangeCurrency={setDisplayCurrency}
        currentUser={currentUser}
        customerProfile={customerProfile}
        onOpenAccount={openCustomerAccount}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        isOwner={isOwner}
        onOpenSettings={
          isOwner
            ? () => {
                setIsCartOpen(false);
                openSettingsModal('shop');
              }
            : undefined
        }
      />

      <CustomerAccountModal
        isOpen={isAccountOpen}
        initialTab={accountInitialTab}
        currentUser={currentUser}
        profile={customerProfile}
        orders={customerOrders}
        ordersLoading={customerOrdersLoading}
        settings={settings}
        onClose={() => setIsAccountOpen(false)}
        onSignOut={handleOwnerSignOut}
        onOpenCatalog={() => {
          const el = document.getElementById('catalog');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {isOwner && (
        <ShopSettingsModal
          isOpen={isSettingsOpen}
          initialTab={settingsInitialTab}
          settings={settings}
          sizeCharts={sizeCharts}
          products={products}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={handleSaveSettings}
          onSaveSizeCharts={handleSaveSizeCharts}
          onAddProduct={handleAddProduct}
          onRemoveProduct={handleRemoveProduct}
          onResetCatalog={handleResetDefaults}
        />
      )}
    </div>
  );
}
