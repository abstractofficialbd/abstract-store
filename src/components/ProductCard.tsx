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

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
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
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        />
      </button>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-[#59607A] mb-1.5">
          <span className="uppercase tracking-wider font-medium truncate">
            {product.category} · {product.tier}
          </span>
          {product.availability === 'Limited' && (
            <span className="text-[#8E6B2E] font-semibold whitespace-nowrap shrink-0">
              Limited
            </span>
          )}
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
            onClick={handleQuickAdd}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066] ${
              justAdded
                ? 'bg-[#C5A467] text-[#050838] font-semibold'
                : 'bg-[#F1F3F8] text-[#0A1045] hover:bg-[#000066] hover:text-white'
            }`}
          >
            {justAdded ? (
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
