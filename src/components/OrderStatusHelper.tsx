import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { ShopSettings } from '../types/shop';
import { buildWhatsAppUrl, formatOrderStatusMessage } from '../utils/whatsapp';

interface OrderStatusHelperProps {
  settings: ShopSettings;
}

export function OrderStatusHelper({ settings }: OrderStatusHelperProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [errorText, setErrorText] = useState('');
  const [copied, setCopied] = useState(false);

  const hasBothFields =
    customerName.trim().length > 0 && customerPhone.trim().length > 0;

  const liveMessage = formatOrderStatusMessage({
    customerName,
    customerPhone,
    settings,
  });

  const whatsappUrl = buildWhatsAppUrl(settings.whatsappNumber, liveMessage);

  const validateFields = (): boolean => {
    if (!customerName.trim()) {
      setErrorText('Please enter the name used when placing your order.');
      return false;
    }
    if (!customerPhone.trim()) {
      setErrorText('Please enter the phone number used when placing your order.');
      return false;
    }
    setErrorText('');
    return true;
  };

  const handleOpenWhatsApp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!validateFields()) {
      e.preventDefault();
    }
  };

  const handleCopy = async () => {
    if (!validateFields()) return;
    try {
      await navigator.clipboard.writeText(liveMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      id="order-status"
      className="mt-10 p-6 sm:p-7 bg-white border border-[#E1E5EE] rounded-xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        <div className="lg:col-span-6 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8E6B2E] mb-1">
              Order Tracking
            </p>
            <h3 className="font-display text-2xl font-semibold text-[#0A1045]">
              Check your order status on WhatsApp
            </h3>
            <p className="text-sm text-[#59607A] mt-1 leading-relaxed">
              Enter the full name and phone number used for your order to generate a
              ready-to-send tracking message.
            </p>
          </div>

          {errorText && (
            <p
              role="alert"
              className="px-3 py-2 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
            >
              {errorText}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="status-customer-name"
                className="block text-xs font-medium text-[#434963] mb-1"
              >
                Name Used for Order *
              </label>
              <input
                id="status-customer-name"
                type="text"
                required
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errorText) setErrorText('');
                }}
                placeholder="Farhan Rahman"
                className="w-full h-10 px-3 text-sm bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
              />
            </div>

            <div>
              <label
                htmlFor="status-customer-phone"
                className="block text-xs font-medium text-[#434963] mb-1"
              >
                Phone Number Used for Order *
              </label>
              <input
                id="status-customer-phone"
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  if (errorText) setErrorText('');
                }}
                placeholder="+880 1711-000000"
                className="w-full h-10 px-3 text-sm font-mono-tabular bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenWhatsApp}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066]"
            >
              <MessageCircle className="w-4 h-4 text-[#C5A467]" strokeWidth={1.75} />
              <span>Track Order in WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-[#0A1045] bg-[#F1F3F8] hover:bg-[#E1E5EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000066]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#156142]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Message</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[#59607A]">
              {hasBothFields ? 'Ready to Send Preview' : 'Sample Message Preview'}
            </span>
          </div>

          <pre className="p-4 bg-[#F7F8FB] border border-[#E1E5EE] rounded-lg text-xs text-[#262B47] whitespace-pre-wrap font-sans leading-relaxed">
            {liveMessage}
          </pre>
        </div>
      </div>
    </div>
  );
}
