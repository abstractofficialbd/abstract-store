import { useEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import {
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_SIZE_CHARTS,
  HERO_IMAGE,
} from '../data/catalog';
import {
  CollectionTier,
  Product,
  ProductCategory,
  ShopSettings,
  SizeChart,
  SizeChartGroupKey,
} from '../types/shop';
import { formatCurrency, sanitizePhoneNumber } from '../utils/whatsapp';
import { ResilientImage } from './ResilientImage';

export type SettingsModalTab = 'shop' | 'banner' | 'sizes' | 'product';

interface ShopSettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsModalTab;
  settings: ShopSettings;
  sizeCharts: Record<SizeChartGroupKey, SizeChart>;
  products: Product[];
  onClose: () => void;
  onSaveSettings: (next: ShopSettings) => Promise<void> | void;
  onSaveSizeCharts: (next: Record<SizeChartGroupKey, SizeChart>) => Promise<void> | void;
  onAddProduct: (product: Product) => Promise<void> | void;
  onRemoveProduct: (productId: string) => Promise<void> | void;
  onResetCatalog: () => Promise<void> | void;
}

const CURRENCIES = ['৳', '$', '€', '£', '₹', 'AED ', 'RM '];
const PRODUCT_CATEGORIES: Exclude<ProductCategory, 'All'>[] = [
  'Panjabis',
  'Casual Shirts',
  'Polos',
  'T-Shirts',
  'Hoodies',
  'Sweatshirts',
  'Jackets',
  'Trousers/Denim',
];

const TIERS: CollectionTier[] = ['Platinum', 'Luxury', 'Premium', 'Essential'];

const CHART_GROUPS: { key: SizeChartGroupKey; label: string }[] = [
  { key: 'panjabis', label: 'Panjabis' },
  { key: 'tops_shirts', label: 'Shirts, Polos & Tees' },
  { key: 'outerwear', label: 'Hoodies, Sweats & Jackets' },
  { key: 'trousers_denim', label: 'Trousers & Denim' },
];

const IMAGE_PRESETS = [
  {
    label: 'Obsidian Navy Panjabi',
    path: '/src/assets/images/product_platinum_panjabi_1794991964940.jpg',
  },
  {
    label: 'Alabaster Ivory Panjabi',
    path: '/src/assets/images/product_ivory_panjabi_1794991965455.jpg',
  },
  {
    label: 'Linen Casual Shirt',
    path: '/src/assets/images/product_casual_shirt_1794991966227.jpg',
  },
  {
    label: 'Mercerized Knit Polo',
    path: '/src/assets/images/product_knit_polo_1794991966805.jpg',
  },
  {
    label: 'Heavyweight Boxy Tee',
    path: '/src/assets/images/product_essential_tee_1794990506185.jpg',
  },
  {
    label: 'Washed Fleece Hoodie',
    path: '/src/assets/images/product_heavyweight_hoodie_1794990504891.jpg',
  },
  {
    label: 'French Terry Sweatshirt',
    path: '/src/assets/images/product_crew_sweatshirt_1794991967089.jpg',
  },
  {
    label: 'Technical Bomber Jacket',
    path: '/src/assets/images/product_bomber_jacket_1794990507152.jpg',
  },
  {
    label: 'Utility Jacket',
    path: '/src/assets/images/product_relaxed_overshirt_1794990505796.jpg',
  },
  {
    label: 'Pleated Trousers',
    path: '/src/assets/images/product_pleated_trousers_1794990505921.jpg',
  },
  {
    label: 'Selvedge Denim',
    path: '/src/assets/images/product_cargo_denim_1794990506164.jpg',
  },
];

const MAX_DATA_URL_LENGTH = 400000;

function resizeImageToDataUrl(file: File, maxDimension = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const tryEncode = (dim: number, qualities: number[]): string | null => {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0, width, height);
          for (const q of qualities) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
              return dataUrl;
            }
          }
          return null;
        };

        const firstPass = tryEncode(maxDimension, [0.78, 0.65, 0.52, 0.4]);
        if (firstPass) {
          resolve(firstPass);
          return;
        }

        const secondPass = tryEncode(Math.round(maxDimension * 0.72), [0.55, 0.42, 0.34]);
        if (secondPass) {
          resolve(secondPass);
          return;
        }

        reject(
          new Error(
            'Image is too large after compression. Please choose a smaller JPG or PNG.'
          )
        );
      };
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  });
}

export function ShopSettingsModal({
  isOpen,
  initialTab = 'shop',
  settings,
  sizeCharts,
  products,
  onClose,
  onSaveSettings,
  onSaveSizeCharts,
  onAddProduct,
  onRemoveProduct,
  onResetCatalog,
}: ShopSettingsModalProps) {
  const [tab, setTab] = useState<SettingsModalTab>(initialTab);
  const [form, setForm] = useState<ShopSettings>(settings);
  const [chartDrafts, setChartDrafts] =
    useState<Record<SizeChartGroupKey, SizeChart>>(sizeCharts);
  const [activeChartGroup, setActiveChartGroup] =
    useState<SizeChartGroupKey>('panjabis');
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: 'Panjabis' as Exclude<ProductCategory, 'All'>,
    tier: 'Platinum' as CollectionTier,
    price: '4500',
    colorway: 'Midnight Black',
    availability: 'In Stock' as 'In Stock' | 'Limited',
    description: '',
    image: IMAGE_PRESETS[0].path,
  });
  const [uploadError, setUploadError] = useState('');
  const [bannerUploadError, setBannerUploadError] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setSaveError('');
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setForm(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    setChartDrafts(sizeCharts);
  }, [sizeCharts, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setSaveError('');
    setSavedFeedback(msg);
    window.setTimeout(() => setSavedFeedback(''), 2600);
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setIsSaving(true);
    try {
      await onSaveSettings({
        ...form,
        shopName: form.shopName.trim() || 'ABSTRACT.',
        whatsappNumber: sanitizePhoneNumber(form.whatsappNumber) || '8801711000000',
        freeShippingThreshold: Math.max(0, Number(form.freeShippingThreshold) || 0),
        flatShippingFee: Math.max(0, Number(form.flatShippingFee) || 0),
        aboutText: form.aboutText.trim() || DEFAULT_SHOP_SETTINGS.aboutText,
        facebookUrl: form.facebookUrl.trim(),
        instagramUrl: form.instagramUrl.trim(),
        tiktokUrl: form.tiktokUrl.trim(),
        exchangeRates: {
          USD: Math.max(1, Number(form.exchangeRates?.USD) || 120),
          EUR: Math.max(1, Number(form.exchangeRates?.EUR) || 130),
          AED: Math.max(1, Number(form.exchangeRates?.AED) || 32.7),
        },
      });
      showFeedback('Store settings, rates & social links published live');
    } catch {
      setSaveError('Could not save settings to cloud. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBannerImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploadError('');
    try {
      const resized = await resizeImageToDataUrl(file, 1100);
      if (resized) {
        setForm((f) => ({
          ...f,
          heroBanner: { ...f.heroBanner, image: resized },
        }));
      }
    } catch (err) {
      setBannerUploadError(
        err instanceof Error
          ? err.message
          : 'Could not process that banner image. Please try a JPG or PNG.'
      );
    } finally {
      if (bannerFileInputRef.current) {
        bannerFileInputRef.current.value = '';
      }
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setIsSaving(true);
    try {
      await onSaveSettings({
        ...form,
        heroBanner: {
          eyebrow: form.heroBanner.eyebrow.trim(),
          headline:
            form.heroBanner.headline.trim() ||
            DEFAULT_SHOP_SETTINGS.heroBanner.headline,
          subtext:
            form.heroBanner.subtext.trim() ||
            DEFAULT_SHOP_SETTINGS.heroBanner.subtext,
          ctaLabel:
            form.heroBanner.ctaLabel.trim() ||
            DEFAULT_SHOP_SETTINGS.heroBanner.ctaLabel,
          image:
            form.heroBanner.image.trim() ||
            DEFAULT_SHOP_SETTINGS.heroBanner.image,
        },
      });
      showFeedback('Front banner published live');
    } catch {
      setSaveError('Could not publish front banner. Ensure image size is reasonable and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetBanner = async () => {
    const nextForm: ShopSettings = {
      ...form,
      heroBanner: { ...DEFAULT_SHOP_SETTINGS.heroBanner },
    };
    setSaveError('');
    setIsSaving(true);
    try {
      setForm(nextForm);
      await onSaveSettings(nextForm);
      setBannerUploadError('');
      showFeedback('Front banner reset to default');
    } catch {
      setSaveError('Could not reset front banner.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentChart = chartDrafts[activeChartGroup];

  const handleRowSizeChange = (rowIdx: number, nextSize: string) => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      const nextRows = target.rows.map((r, i) =>
        i === rowIdx ? { ...r, size: nextSize } : r
      );
      return { ...prev, [activeChartGroup]: { ...target, rows: nextRows } };
    });
  };

  const handleCellValueChange = (
    rowIdx: number,
    colIdx: number,
    nextVal: string
  ) => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      const nextRows = target.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const nextValues = r.values.map((v, j) => (j === colIdx ? nextVal : v));
        return { ...r, values: nextValues };
      });
      return { ...prev, [activeChartGroup]: { ...target, rows: nextRows } };
    });
  };

  const handleColumnLabelChange = (colIdx: number, nextLabel: string) => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      const nextCols = target.columns.map((c, i) => (i === colIdx ? nextLabel : c));
      return { ...prev, [activeChartGroup]: { ...target, columns: nextCols } };
    });
  };

  const handleAddColumn = () => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      return {
        ...prev,
        [activeChartGroup]: {
          ...target,
          columns: [...target.columns, 'New Metric'],
          rows: target.rows.map((r) => ({
            ...r,
            values: [...r.values, '—'],
          })),
        },
      };
    });
  };

  const handleDeleteColumn = (colIdx: number) => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      if (target.columns.length <= 1) return prev;
      return {
        ...prev,
        [activeChartGroup]: {
          ...target,
          columns: target.columns.filter((_, i) => i !== colIdx),
          rows: target.rows.map((r) => ({
            ...r,
            values: r.values.filter((_, j) => j !== colIdx),
          })),
        },
      };
    });
  };

  const handleAddSizeRow = () => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      const emptyValues = target.columns.map(() => '—');
      return {
        ...prev,
        [activeChartGroup]: {
          ...target,
          rows: [...target.rows, { size: 'XXL', values: emptyValues }],
        },
      };
    });
  };

  const handleDeleteSizeRow = (rowIdx: number) => {
    setChartDrafts((prev) => {
      const target = prev[activeChartGroup];
      if (target.rows.length <= 1) return prev;
      return {
        ...prev,
        [activeChartGroup]: {
          ...target,
          rows: target.rows.filter((_, i) => i !== rowIdx),
        },
      };
    });
  };

  const handleSaveSizeCharts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setIsSaving(true);
    try {
      await onSaveSizeCharts(chartDrafts);
      showFeedback('Size chart published across all products');
    } catch {
      setSaveError('Could not save size charts to cloud. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetActiveChart = async () => {
    const defaultChart = DEFAULT_SIZE_CHARTS[activeChartGroup];
    const next = { ...chartDrafts, [activeChartGroup]: defaultChart };
    setSaveError('');
    setIsSaving(true);
    try {
      setChartDrafts(next);
      await onSaveSizeCharts(next);
      showFeedback(`${defaultChart.label} chart reset to defaults`);
    } catch {
      setSaveError('Could not reset size chart.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    try {
      const resized = await resizeImageToDataUrl(file, 720);
      if (resized) {
        setNewProduct((p) => ({ ...p, image: resized }));
      }
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Could not process that image file. Please try a JPG or PNG.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim()) return;
    setSaveError('');
    setIsSaving(true);
    const parsedPrice = Math.max(1, Number(newProduct.price) || 1500);
    const defaultSizes =
      newProduct.category === 'Panjabis'
        ? ['38 (S)', '40 (M)', '42 (L)', '44 (XL)']
        : newProduct.category === 'Trousers/Denim'
        ? ['30 (S)', '32 (M)', '34 (L)', '36 (XL)']
        : ['S', 'M', 'L', 'XL'];

    const product: Product = {
      id: `abstract-custom-${Date.now()}`,
      name: newProduct.name.trim(),
      category: newProduct.category,
      tier: newProduct.tier,
      price: parsedPrice,
      image: newProduct.image.trim() || IMAGE_PRESETS[0].path,
      colorway: newProduct.colorway.trim() || 'Midnight Black',
      availability: newProduct.availability,
      description:
        newProduct.description.trim() ||
        'Small-batch menswear piece tailored for daily rotation and direct WhatsApp ordering.',
      specs: ['Tailored modern fit', 'Instant confirmation via WhatsApp'],
      sizes: defaultSizes,
    };

    try {
      await onAddProduct(product);
      setNewProduct({
        name: '',
        category: 'Panjabis',
        tier: 'Platinum',
        price: '4500',
        colorway: 'Midnight Black',
        availability: 'In Stock',
        description: '',
        image: IMAGE_PRESETS[0].path,
      });
      setUploadError('');
      showFeedback('Garment published to live storefront');
    } catch {
      setSaveError('Could not publish product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveProductClick = async (productId: string) => {
    setSaveError('');
    setIsSaving(true);
    try {
      await onRemoveProduct(productId);
      showFeedback('Garment removed from storefront');
    } catch {
      setSaveError('Could not remove product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaultsClick = async () => {
    setSaveError('');
    setIsSaving(true);
    try {
      await onResetCatalog();
      showFeedback('Storefront reset to defaults');
    } catch {
      setSaveError('Could not reset storefront defaults.');
    } finally {
      setIsSaving(false);
    }
  };

  const isPresetImage = IMAGE_PRESETS.some((p) => p.path === newProduct.image);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#02042B]/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Store Owner Settings"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-[#000066] border-b border-[#C5A467]/35 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-white">
            Store Owner Setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-3 flex items-center gap-1 border-b border-[#E1E5EE] bg-white overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('shop')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'shop'
                ? 'border-[#000066] text-[#000066]'
                : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
            }`}
          >
            Shop, About &amp; Socials
          </button>
          <button
            type="button"
            onClick={() => setTab('banner')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'banner'
                ? 'border-[#000066] text-[#000066]'
                : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
            }`}
          >
            Front Banner
          </button>
          <button
            type="button"
            onClick={() => setTab('sizes')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'sizes'
                ? 'border-[#000066] text-[#000066]'
                : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
            }`}
          >
            Size Charts
          </button>
          <button
            type="button"
            onClick={() => setTab('product')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'product'
                ? 'border-[#000066] text-[#000066]'
                : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
            }`}
          >
            Add &amp; Manage Garments ({products.length})
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {savedFeedback && (
            <p className="mb-4 px-3 py-2 text-xs font-medium text-[#156142] bg-[#156142]/10 rounded-lg">
              {savedFeedback}
            </p>
          )}
          {saveError && (
            <p
              role="alert"
              className="mb-4 px-3 py-2 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
            >
              {saveError}
            </p>
          )}

          {tab === 'shop' && (
            <form onSubmit={handleSaveShop} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={form.shopName}
                    onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                    className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    WhatsApp Number (country code + digits)
                  </label>
                  <input
                    type="text"
                    value={form.whatsappNumber}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsappNumber: e.target.value }))
                    }
                    placeholder="e.g. 8801711000000"
                    className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Currency
                  </label>
                  <select
                    value={form.currencySymbol}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currencySymbol: e.target.value }))
                    }
                    className="w-full h-10 px-2.5 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Delivery Fee
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.flatShippingFee}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        flatShippingFee: Number(e.target.value),
                      }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Free Over
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.freeShippingThreshold}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        freeShippingThreshold: Number(e.target.value),
                      }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-[#E1E5EE]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#59607A]">
                  Currency Converter Rates (BDT per 1 unit)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      1 USD ($) in ৳
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={form.exchangeRates?.USD ?? 120}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          exchangeRates: {
                            ...f.exchangeRates,
                            USD: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      1 EUR (€) in ৳
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={form.exchangeRates?.EUR ?? 130}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          exchangeRates: {
                            ...f.exchangeRates,
                            EUR: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      1 AED in ৳
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={form.exchangeRates?.AED ?? 32.7}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          exchangeRates: {
                            ...f.exchangeRates,
                            AED: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E1E5EE]">
                <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                  About Us Text (shown in bottom About section)
                </label>
                <textarea
                  rows={3}
                  value={form.aboutText}
                  onChange={(e) => setForm((f) => ({ ...f, aboutText: e.target.value }))}
                  placeholder="Share your brand story, fabric philosophy, and craftsmanship..."
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#59607A]">
                  Social Media Links
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Facebook URL
                    </label>
                    <input
                      type="text"
                      value={form.facebookUrl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, facebookUrl: e.target.value }))
                      }
                      placeholder="https://facebook.com/..."
                      className="w-full h-10 px-3 text-xs bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Instagram URL
                    </label>
                    <input
                      type="text"
                      value={form.instagramUrl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, instagramUrl: e.target.value }))
                      }
                      placeholder="https://instagram.com/..."
                      className="w-full h-10 px-3 text-xs bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      TikTok URL
                    </label>
                    <input
                      type="text"
                      value={form.tiktokUrl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, tiktokUrl: e.target.value }))
                      }
                      placeholder="https://tiktok.com/@..."
                      className="w-full h-10 px-3 text-xs bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleResetDefaultsClick}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6E6E6A] hover:text-[#0D0D0D] disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Defaults</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Shop Settings'}
                </button>
              </div>
            </form>
          )}

          {tab === 'banner' && (
            <form onSubmit={handleSaveBanner} className="space-y-4">
              <div className="p-3.5 bg-white border border-[#D6D6D2] rounded-lg space-y-3">
                <p className="text-xs font-medium text-[#4A4A46]">
                  Front Banner Photo
                </p>

                <div className="relative w-full h-36 rounded-lg overflow-hidden bg-[#141416] border border-[#E1E5EE]">
                  <ResilientImage
                    src={form.heroBanner.image}
                    alt="Front banner preview"
                    fallbackLabel={form.shopName}
                    className="w-full h-full object-cover object-center"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent"
                  />
                  <div className="absolute inset-y-0 left-0 p-4 flex flex-col justify-center max-w-sm">
                    {form.heroBanner.eyebrow && (
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#D9BC82] mb-1 truncate">
                        {form.heroBanner.eyebrow}
                      </p>
                    )}
                    <p className="font-display text-lg font-semibold text-white leading-tight line-clamp-2">
                      {form.heroBanner.headline || 'Featured Collection'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={bannerFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBannerImageChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bannerFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded-md transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Banner Photo</span>
                  </button>

                  <select
                    aria-label="Banner photo preset"
                    value={
                      form.heroBanner.image === HERO_IMAGE ||
                      IMAGE_PRESETS.some((p) => p.path === form.heroBanner.image)
                        ? form.heroBanner.image
                        : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        setForm((f) => ({
                          ...f,
                          heroBanner: { ...f.heroBanner, image: e.target.value },
                        }));
                      }
                    }}
                    className="h-8 px-2 text-xs bg-[#F7F8FB] border border-[#D6D6D2] rounded-md text-[#0A1045] focus:outline-none focus:border-[#000066]"
                  >
                    <option value="">Custom uploaded / URL photo</option>
                    <option value={HERO_IMAGE}>Default: Architectural Lookbook</option>
                    {IMAGE_PRESETS.map((preset) => (
                      <option key={preset.path} value={preset.path}>
                        Preset: {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  value={
                    form.heroBanner.image.startsWith('data:')
                      ? ''
                      : form.heroBanner.image
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heroBanner: { ...f.heroBanner, image: e.target.value },
                    }))
                  }
                  placeholder="Or paste a banner image URL (https://...)"
                  className="w-full h-9 px-3 text-xs bg-[#F7F8FB] border border-[#D6D6D2] rounded-md focus:outline-none focus:border-[#000066]"
                />

                {bannerUploadError && (
                  <p className="text-[11px] text-[#B91C1C]">{bannerUploadError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Top Tagline / Eyebrow
                  </label>
                  <input
                    type="text"
                    value={form.heroBanner.eyebrow}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        heroBanner: { ...f.heroBanner, eyebrow: e.target.value },
                      }))
                    }
                    placeholder="e.g. Eid Collection · New Drop"
                    className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Button Label
                  </label>
                  <input
                    type="text"
                    value={form.heroBanner.ctaLabel}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        heroBanner: { ...f.heroBanner, ctaLabel: e.target.value },
                      }))
                    }
                    placeholder="e.g. Explore Collection"
                    className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                  Main Banner Headline *
                </label>
                <input
                  type="text"
                  required
                  value={form.heroBanner.headline}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heroBanner: { ...f.heroBanner, headline: e.target.value },
                    }))
                  }
                  placeholder="Refined menswear crafted for presence."
                  className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                  Banner Description Text
                </label>
                <textarea
                  rows={3}
                  value={form.heroBanner.subtext}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      heroBanner: { ...f.heroBanner, subtext: e.target.value },
                    }))
                  }
                  placeholder="Highlight your newest drop, fabric story, or seasonal offer..."
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleResetBanner}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6E6E6A] hover:text-[#0D0D0D] disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Banner</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {isSaving ? 'Publishing...' : 'Save Front Banner'}
                </button>
              </div>
            </form>
          )}

          {tab === 'sizes' && currentChart && (
            <form onSubmit={handleSaveSizeCharts} className="space-y-4">
              <div className="flex items-center gap-1 p-1 bg-[#E1E5EE] rounded-lg overflow-x-auto">
                {CHART_GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveChartGroup(g.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeChartGroup === g.key
                        ? 'bg-[#000066] text-white shadow-sm'
                        : 'text-[#434963] hover:text-[#000066]'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Chart Heading
                  </label>
                  <input
                    type="text"
                    value={currentChart.label}
                    onChange={(e) =>
                      setChartDrafts((prev) => ({
                        ...prev,
                        [activeChartGroup]: {
                          ...prev[activeChartGroup],
                          label: e.target.value,
                        },
                      }))
                    }
                    className="w-full h-9 px-3 text-xs font-medium bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Unit
                  </label>
                  <select
                    aria-label="Measurement unit"
                    value={currentChart.unit}
                    onChange={(e) =>
                      setChartDrafts((prev) => ({
                        ...prev,
                        [activeChartGroup]: {
                          ...prev[activeChartGroup],
                          unit: e.target.value as 'inches' | 'cm',
                        },
                      }))
                    }
                    className="w-full h-9 px-2.5 text-xs font-medium bg-white border border-[#D6D6D2] rounded-lg text-[#0D0D0D] focus:outline-none focus:border-[#000066]"
                  >
                    <option value="inches">inches</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto bg-white border border-[#E6E6E3] rounded-lg p-3">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E6E6E3]">
                      <th className="pb-2 pr-2 font-medium text-[#6E6E6A]">Size</th>
                      {currentChart.columns.map((col, colIdx) => (
                        <th key={colIdx} className="pb-2 px-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              aria-label={`Column ${colIdx + 1} name`}
                              value={col}
                              onChange={(e) =>
                                handleColumnLabelChange(colIdx, e.target.value)
                              }
                              className="w-24 h-7 px-2 text-xs font-medium text-[#0D0D0D] bg-[#F8F8F7] border border-[#E6E6E3] rounded focus:outline-none focus:border-[#000066]"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteColumn(colIdx)}
                              disabled={currentChart.columns.length <= 1}
                              aria-label={`Remove column ${col}`}
                              title="Remove column"
                              className="p-1 text-[#8E8E88] hover:text-[#B91C1C] disabled:opacity-30 cursor-pointer shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0ED]">
                    {currentChart.rows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            aria-label={`Size label row ${rowIdx + 1}`}
                            value={row.size}
                            onChange={(e) =>
                              handleRowSizeChange(rowIdx, e.target.value)
                            }
                            className="w-24 h-8 px-2 text-xs font-mono-tabular font-medium bg-white border border-[#D6D6D2] rounded focus:outline-none focus:border-[#000066]"
                          />
                        </td>
                        {row.values.map((val, colIdx) => (
                          <td key={colIdx} className="py-2 px-1.5">
                            <input
                              type="text"
                              aria-label={`${row.size} ${currentChart.columns[colIdx]}`}
                              value={val}
                              onChange={(e) =>
                                handleCellValueChange(rowIdx, colIdx, e.target.value)
                              }
                              className="w-24 h-8 px-2 text-xs font-mono-tabular bg-white border border-[#D6D6D2] rounded focus:outline-none focus:border-[#000066]"
                            />
                          </td>
                        ))}
                        <td className="py-2 pl-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteSizeRow(rowIdx)}
                            disabled={currentChart.rows.length <= 1}
                            aria-label={`Remove size ${row.size}`}
                            className="p-1.5 text-[#8E8E88] hover:text-[#B91C1C] disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleAddSizeRow}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#000066] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Size Row</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#8E6B2E] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Measurement Column</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                  Fit &amp; Measurement Note
                </label>
                <input
                  type="text"
                  value={currentChart.note}
                  onChange={(e) =>
                    setChartDrafts((prev) => ({
                      ...prev,
                      [activeChartGroup]: {
                        ...prev[activeChartGroup],
                        note: e.target.value,
                      },
                    }))
                  }
                  className="w-full h-9 px-3 text-xs bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleResetActiveChart}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6E6E6A] hover:text-[#0D0D0D] disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset This Chart</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Size Charts'}
                </button>
              </div>
            </form>
          )}

          {tab === 'product' && (
            <div className="space-y-6">
              <form onSubmit={handleCreateProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Garment Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Platinum Embroidered Eid Panjabi"
                    className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Category
                    </label>
                    <select
                      value={newProduct.category}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          category: e.target.value as Exclude<ProductCategory, 'All'>,
                        }))
                      }
                      className="w-full h-10 px-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    >
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Line / Tier
                    </label>
                    <select
                      value={newProduct.tier}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          tier: e.target.value as CollectionTier,
                        }))
                      }
                      className="w-full h-10 px-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    >
                      {TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Price ({settings.currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newProduct.price}
                      onChange={(e) =>
                        setNewProduct((p) => ({ ...p, price: e.target.value }))
                      }
                      className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Colorway
                    </label>
                    <input
                      type="text"
                      value={newProduct.colorway}
                      onChange={(e) =>
                        setNewProduct((p) => ({ ...p, colorway: e.target.value }))
                      }
                      placeholder="Midnight Black"
                      className="w-full h-10 px-3 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                      Availability
                    </label>
                    <select
                      value={newProduct.availability}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          availability: e.target.value as 'In Stock' | 'Limited',
                        }))
                      }
                      className="w-full h-10 px-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Limited">Limited</option>
                    </select>
                  </div>
                </div>

                <div className="p-3.5 bg-white border border-[#D6D6D2] rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-20 rounded-md overflow-hidden border border-[#E1E5EE] bg-[#F7F8FB] shrink-0">
                      <ResilientImage
                        src={newProduct.image}
                        alt={newProduct.name || 'Product preview'}
                        fallbackLabel="Photo"
                        className="w-full h-full object-cover object-center"
                      />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded-md transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Photo</span>
                        </button>

                        <select
                          aria-label="Studio preset photo"
                          value={isPresetImage ? newProduct.image : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              setNewProduct((p) => ({ ...p, image: e.target.value }));
                            }
                          }}
                          className="h-8 px-2 text-xs bg-[#F7F8FB] border border-[#D6D6D2] rounded-md text-[#0A1045] focus:outline-none focus:border-[#000066]"
                        >
                          {!isPresetImage && (
                            <option value="">Custom uploaded / URL photo</option>
                          )}
                          {IMAGE_PRESETS.map((preset) => (
                            <option key={preset.path} value={preset.path}>
                              Preset: {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <input
                        type="text"
                        value={newProduct.image.startsWith('data:') ? '' : newProduct.image}
                        onChange={(e) =>
                          setNewProduct((p) => ({ ...p, image: e.target.value }))
                        }
                        placeholder="Or paste an image URL (https://...)"
                        className="w-full h-8 px-2.5 text-xs bg-[#F7F8FB] border border-[#D6D6D2] rounded-md focus:outline-none focus:border-[#000066]"
                      />

                      {uploadError && (
                        <p className="text-[11px] text-[#B91C1C]">{uploadError}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4A46] mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={newProduct.description}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder="Fabric weave, collar detailing, and fit profile..."
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D6D6D2] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isSaving ? 'Publishing...' : 'Add to Storefront'}</span>
                  </button>
                </div>
              </form>

              {products.length > 0 && (
                <div className="pt-4 border-t border-[#E1E5EE] space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#59607A]">
                    Listed Products ({products.length})
                  </p>
                  <div className="space-y-2">
                    {products.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-2.5 bg-white border border-[#E1E5EE] rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ResilientImage
                            src={item.image}
                            alt={item.name}
                            fallbackLabel={item.category}
                            className="w-10 h-12 object-cover rounded border border-[#E1E5EE] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0A1045] truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-[#59607A]">
                              {item.category} · {item.tier} ·{' '}
                              <span className="font-mono-tabular">
                                {formatCurrency(item.price, settings.currencySymbol)}
                              </span>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRemoveProductClick(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="p-2 text-[#737B96] hover:text-[#B91C1C] disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
