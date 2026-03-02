'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
    ArrowLeft,
    Calendar,
    MapPin,
    Info,
    X,
} from 'lucide-react';

interface PaymentSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onPaySuccess: () => void;
    matchTitle: string;
    matchTime: string;
    matchLocation: string;
    price: number;
    walletBalance: number;
}

export default function PaymentSheet({
    isOpen,
    onClose,
    onPaySuccess,
    matchTitle,
    matchTime,
    matchLocation,
    price,
    walletBalance,
}: PaymentSheetProps) {
    const [agreed, setAgreed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const toPay = Math.max(0, price - walletBalance);

    const handlePay = async () => {
        if (!agreed) return;
        setIsProcessing(true);
        // Simulate payment processing
        await new Promise(r => setTimeout(r, 1500));
        setIsProcessing(false);
        onPaySuccess();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* ── Backdrop ──────────────────────────── */}
            <div
                className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
                onClick={onClose}
            />

            {/* ── Bottom Sheet ─────────────────────── */}
            <div className="
        fixed bottom-0 inset-x-0 z-[70]
        bg-white rounded-t-3xl
        max-w-md mx-auto
        animate-slide-up
        h-[75vh] overflow-y-auto
      ">
                {/* Pull indicator */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Header */}
                <div className="flex items-center px-5 pb-4 relative">
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
                    >
                        <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                    </button>
                    <h2 className="text-lg font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                        Cart
                    </h2>
                    <button
                        onClick={onClose}
                        className="ms-auto w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
                    >
                        <X className="w-5 h-5 text-gray-400" strokeWidth={2} />
                    </button>
                </div>

                {/* Match Card */}
                <div className="mx-5 rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 relative">
                        <Image
                            src="/images/stadium-bg.png"
                            alt="Match"
                            fill
                            className="object-cover"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-brand-black">{matchTitle}</h3>
                        <div className="flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500">{matchTime}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500 truncate">{matchLocation}</span>
                        </div>
                    </div>
                </div>

                {/* Price Breakdown */}
                <div className="mx-5 mt-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total</span>
                        <span className="text-sm font-bold text-brand-black">SAR {price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Wallet</span>
                        <span className="text-sm font-bold text-brand-black">SAR {walletBalance.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-gray-100" />
                    <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-brand-black">To pay</span>
                        <span className="text-xl font-extrabold text-brand-red">SAR {toPay.toFixed(2)}</span>
                    </div>
                </div>

                {/* Refund Policy */}
                <div className="mx-5 mt-5 bg-brand-red/90 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div>
                            <p className="text-sm font-bold text-white">Refund Policy</p>
                            <p className="text-xs text-white/80 mt-1">
                                Non-refundable if cancelled within 2 hours of the match.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Agree Checkbox */}
                <div className="mx-5 mt-5 flex items-start gap-3">
                    <button
                        onClick={() => setAgreed(!agreed)}
                        className={`
              w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5
              flex items-center justify-center transition-all
              ${agreed
                                ? 'bg-brand-green border-brand-green'
                                : 'border-gray-300 bg-white'
                            }
            `}
                    >
                        {agreed && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path d="M2 6l3 3 5-5" />
                            </svg>
                        )}
                    </button>
                    <p className="text-xs text-gray-500">
                        I agree to the cancellation policy and booking terms.
                    </p>
                </div>

                {/* CTA Button */}
                <div className="mx-5 mt-5">
                    <button
                        onClick={handlePay}
                        disabled={!agreed || isProcessing}
                        className={`
              w-full py-4 rounded-2xl text-sm font-bold text-white
              flex items-center justify-center gap-2
              transition-all
              ${agreed && !isProcessing
                                ? 'bg-brand-green shadow-[0_4px_16px_rgba(27,67,50,0.3)] active:scale-[0.98]'
                                : 'bg-gray-300 cursor-not-allowed'
                            }
            `}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>Top-up and Pay  SAR {toPay.toFixed(2)}</>
                        )}
                    </button>
                </div>

                {/* Payment Methods */}
                <div className="flex items-center justify-center gap-4 mt-4 pb-8">
                    <span className="text-xs text-gray-400 font-medium">stcpay</span>
                    <span className="text-xs text-gray-400 font-bold italic">kv</span>
                    <span className="text-xs text-gray-400 font-bold">mada</span>
                </div>
            </div>
        </>
    );
}
