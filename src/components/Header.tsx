import { ShoppingBag, User } from 'lucide-react';
import { CustomerProfile, ProductCategory } from '../types/shop';

export const BRAND_LOGO_PATH =
  '/assets/aistudio/abstract_facebook_profile_hq_ec09dc48.jpg';

interface HeaderProps {
  shopName: string;
  cartCount: number;
  isCustomerSignedIn: boolean;
  customerProfile: CustomerProfile | null;
  onOpenCart: () => void;
  onOpenAccount: (tab: 'profile' | 'orders') => void;
  onSelectCategory: (category: ProductCategory) => void;
}

export function Header({
  shopName,
  cartCount,
  isCustomerSignedIn,
  customerProfile,
  onOpenCart,
  onOpenAccount,
  onSelectCategory,
}: HeaderProps) {
  const handleCatalogNav = (category: ProductCategory) => {
    onSelectCategory(category);
    const el = document.getElementById('catalog');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const firstName = customerProfile?.fullName?.trim().split(/\s+/)[0] || 'Profile';

  return (
    <header className="sticky top-0 z-30 bg-[#000066] border-b border-[#C5A467]/35">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <a
          href="#top"
          aria-label={shopName}
          className="inline-flex items-center shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467] rounded"
        >
          <img
            src={BRAND_LOGO_PATH}
            alt={shopName}
            referrerPolicy="no-referrer"
            className="h-10 w-32 sm:w-36 object-cover object-center"
          />
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-white/85"
        >
          <button
            type="button"
            onClick={() => handleCatalogNav('All')}
            className="hover:text-[#D9BC82] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467] rounded"
          >
            Collection
          </button>
          <a
            href="#how-to-order"
            className="hover:text-[#D9BC82] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467] rounded"
          >
            How to Order
          </a>
          <button
            type="button"
            onClick={() => onOpenAccount('orders')}
            className="hover:text-[#D9BC82] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467] rounded"
          >
            Order History
          </button>
          <a
            href="#about"
            className="hover:text-[#D9BC82] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467] rounded"
          >
            About
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenAccount('profile')}
            aria-label={
              isCustomerSignedIn
                ? `Open customer profile (${firstName})`
                : 'Sign in with Phone OTP or open Order History'
            }
            className="inline-flex items-center gap-2 h-9 px-3 text-xs sm:text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A467]"
          >
            {isCustomerSignedIn && customerProfile?.photoUrl ? (
              <img
                src={customerProfile.photoUrl}
                alt={firstName}
                className="w-5 h-5 rounded-full object-cover border border-[#C5A467]"
              />
            ) : (
              <User className="w-4 h-4 text-[#D9BC82]" strokeWidth={1.9} />
            )}
            <span>{isCustomerSignedIn ? firstName : 'Sign In'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Open shopping bag, ${cartCount} items`}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#000066]"
          >
            <ShoppingBag className="w-4 h-4" strokeWidth={2} />
            <span>Bag</span>
            <span className="font-mono-tabular text-xs">({cartCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
