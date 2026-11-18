import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { DisplayCurrency, Product, ShopSettings } from '../types/shop';
import { formatConvertedCurrency } from '../utils/whatsapp';
import { ResilientImage } from './ResilientImage';

interface ProductCardProps {
  product: Product;
  settings: ShopSettings;
  displayCurrency: DisplayCurrency;
  defaultSize?: string;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
}

export function ProductCard({
  product,
  settings,
  displayCurrency,
  defaultSize: propDefaultSize,
  onSelectProduct,
  onQuickAdd,
}: ProductCardProps) {
  const [justAdded, setJustAdded] = useState(false);

  const defaultSize =
    propDefaultSize || product.sizes[1] || product.sizes[0] || 'M';
  const stockCount = Math.max(0, Math.round(product.stockCount ?? 0));
  const isOutOfStock = stockCount === 0;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    onQuickAdd(product, defaultSize);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <article className="group flex flex-col bg-white border border-[#E1E5EE] rounded-xl overflow-hidden transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-[#C5A467]/70">
      <button
        type="button"
        onClick={() => onSelectProduct(product)}
        className="relative aspect-[4/3] w-full bg-[#F1F3F8] overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#000066]"
        aria-label={`View details for ${product.name}`}
      >
        <ResilientImage
          src={product.image}
          alt={`${product.name} in ${product.colorway}`}
          fallbackLabel={product.name}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] ${
            isOutOfStock ? 'opacity-65 grayscale-[25%]' : ''
          }`}
        />
      </button>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-[#59607A] mb-1.5">
          <span className="uppercase tracking-wider font-medium truncate">
            {product.category} · {product.tier}
          </span>
          <span
            className={`font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${
              isOutOfStock
                ? 'text-[#991B1B]'
                : stockCount <= 5
                ? 'text-[#8E6B2E]'
                : 'text-[#59607A]'
            }`}
          >
            {isOutOfStock
              ? 'Out of Stock'
              : stockCount <= 5
              ? `Only ${stockCount} left`
              : `${stockCount} left in stock`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSelectProduct(product)}
          className="text-left text-base font-semibold text-[#0A1045] hover:text-[#000066] transition-colors leading-snug mb-3 cursor-pointer focus-visible:outline-none focus-visible:underline"
        >
          {product.name}
        </button>

        <div className="mt-auto pt-3 border-t border-[#EEF0F6] flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-mono-tabular text-[15px] font-semibold text-[#0A1045]">
              {formatConvertedCurrency(product.price, displayCurrency, settings)}
            </span>
            {displayCurrency !== 'BDT' && (
              <span className="font-mono-tabular text-[11px] text-[#59607A]">
                {formatConvertedCurrency(product.price, 'BDT', settings)}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleQuickAdd}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066] ${
              isOutOfStock
                ? 'bg-[#F1F3F8] text-[#8890A8] cursor-not-allowed'
                : justAdded
                ? 'bg-[#C5A467] text-[#050838] font-semibold cursor-pointer'
                : 'bg-[#F1F3F8] text-[#0A1045] hover:bg-[#000066] hover:text-white cursor-pointer'
            }`}
          >
            {isOutOfStock ? (
              <span>Sold Out</span>
            ) : justAdded ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Added</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Add to Bag</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
