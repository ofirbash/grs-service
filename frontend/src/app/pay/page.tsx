"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, CheckCircle2, AlertCircle, CreditCard, ArrowRightLeft, Smartphone } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface Stone {
  sku: string;
  stone_type: string;
  weight: number;
  fee: number;
  actual_fee?: number;
}

interface PaymentData {
  status: string;
  job_number: number;
  client_name: string;
  branch_name: string;
  service_type: string;
  total_stones: number;
  total_fee: number;
  discount?: number;
  stones: Stone[];
  is_adjustment?: boolean;
  tranzila_terminal: string;
  has_tranzila: boolean;
}

interface HandshakeData {
  thtk: string;
  supplier: string;
  sum: number;
  currency: string;
  currency_code: string;
}

function PaymentForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const statusParam = searchParams.get('status');

  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(3.65);
  const [loadingRate, setLoadingRate] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [handshakeLoading, setHandshakeLoading] = useState(false);
  const [handshakeData, setHandshakeData] = useState<HandshakeData | null>(null);
  const [handshakeError, setHandshakeError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchPaymentDetails();
    fetchExchangeRate();
  }, [token]);

  // Handle return from Tranzila success/fail redirect
  useEffect(() => {
    if (statusParam === 'success' && token) {
      pollPaymentStatus();
    }
  }, [statusParam, token]);

  // Poll payment status while iframe is visible
  useEffect(() => {
    if (showIframe && token) {
      pollRef.current = setInterval(() => {
        pollPaymentStatus();
      }, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [showIframe, token]);

  const pollPaymentStatus = async () => {
    try {
      const resp = await axios.get(`${API_URL}/payment/${token}/status`);
      if (resp.data.status === 'paid') {
        setPaymentComplete(true);
        setShowIframe(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // silent
    }
  };

  const fetchPaymentDetails = async () => {
    try {
      const resp = await axios.get(`${API_URL}/payment/${token}`);
      if (resp.data.status === 'already_paid') {
        setPaymentComplete(true);
      }
      setPaymentData(resp.data);
    } catch {
      setError('Invalid or expired payment link.');
    } finally {
      setLoading(false);
    }
  };

  const fetchExchangeRate = async () => {
    setLoadingRate(true);
    try {
      const resp = await axios.get(`${API_URL}/exchange-rate`);
      setExchangeRate(resp.data.usd_to_ils);
    } catch {
      // fallback
    } finally {
      setLoadingRate(false);
    }
  };

  const initiatePayment = async () => {
    setHandshakeLoading(true);
    setHandshakeError('');
    try {
      const resp = await axios.post(`${API_URL}/payment/${token}/handshake`, {
        currency,
        exchange_rate: exchangeRate,
      });
      setHandshakeData(resp.data);
      setShowIframe(true);

      // Submit the form after state update
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.submit();
        }
      }, 200);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const msg = axiosErr?.response?.data?.detail || 'Failed to initialize payment. Please try again.';
      setHandshakeError(msg);
    } finally {
      setHandshakeLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    setSimulating(true);
    try {
      await axios.post(`${API_URL}/payment/${token}/simulate`);
      setPaymentComplete(true);
    } catch {
      setError('Payment simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  const amountUSD = paymentData?.total_fee || 0;
  const amountILS = Math.round(amountUSD * exchangeRate * 100) / 100;
  const displayAmount = currency === 'USD' ? amountUSD : amountILS;
  const currencySymbol = currency === 'USD' ? '$' : '\u20AA';

  // Determine the iframe URL params
  const iframeBaseUrl = handshakeData
    ? `https://direct.tranzila.com/${handshakeData.supplier}/iframenew.php`
    : '';

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141417] p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Invalid Link</h3>
            <p className="text-muted-foreground">This payment link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141417]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141417] p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141417] p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-xl font-bold mb-2">Payment Received</h3>
            <p className="text-muted-foreground mb-4">
              Thank you! Your payment for Job #{paymentData?.job_number} has been processed successfully.
            </p>
            <Badge className="bg-green-600 text-white text-sm px-4 py-1">Paid</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141417] p-4 flex items-start justify-center pt-8">
      <Card className="w-full max-w-2xl shadow-2xl border-0" data-testid="payment-card">
        <CardHeader className="text-center border-b pb-6">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div className="w-8 h-8 bg-[#141417] rounded-md flex items-center justify-center">
              <span className="text-white text-xs font-bold">B</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Bashari Lab-Direct</h1>
          </div>
          <p className="text-muted-foreground text-xs tracking-widest uppercase">Secure Payment</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Adjustment Notice */}
          {paymentData?.is_adjustment && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-amber-900">Adjustment Payment</p>
              <p className="text-amber-700 text-xs mt-1">
                This is an adjustment payment for Job #{paymentData.job_number}. 
                The amount reflects changes made after the original payment was processed.
              </p>
            </div>
          )}

          {/* Job Info */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Job</Label>
              <p className="font-bold">#{paymentData?.job_number}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Client</Label>
              <p className="font-medium">{paymentData?.client_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Stones</Label>
              <p className="font-medium">{paymentData?.total_stones}</p>
            </div>
          </div>

          {/* Stones Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Weight</TableHead>
                  <TableHead className="text-xs text-right">Fee (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentData?.stones.map((stone, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{stone.sku}</TableCell>
                    <TableCell className="text-xs">{stone.stone_type}</TableCell>
                    <TableCell className="text-xs">{stone.weight} ct</TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      ${((stone.actual_fee != null ? stone.actual_fee : stone.fee) || 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Currency Selector + Amount */}
          {!showIframe && (
            <div className="p-5 bg-muted/50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Payment Currency</Label>
                <Select value={currency} onValueChange={(v) => { setCurrency(v); setHandshakeData(null); }}>
                  <SelectTrigger className="w-32 h-9" data-testid="currency-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="ILS">ILS ({'\u20AA'})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {currency === 'ILS' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRightLeft className="h-3 w-3" />
                  <span>Exchange rate: 1 USD = {loadingRate ? '...' : exchangeRate.toFixed(2)} ILS</span>
                </div>
              )}

              <div className="text-center pt-2 border-t">
                {paymentData?.discount && paymentData.discount > 0 && !paymentData.is_adjustment ? (
                  <p className="text-xs text-muted-foreground mb-1">
                    Discount applied: -${paymentData.discount.toLocaleString()}
                  </p>
                ) : null}
                <p className="text-muted-foreground text-sm">Total Amount Due</p>
                <p className="text-4xl font-bold mt-1" data-testid="payment-amount">
                  {currencySymbol}{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* Payment Methods */}
          {paymentData?.has_tranzila ? (
            <>
              {!showIframe ? (
                <div className="space-y-4">
                  {handshakeError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-red-700 text-sm">{handshakeError}</p>
                    </div>
                  )}

                  <Button
                    onClick={initiatePayment}
                    disabled={handshakeLoading}
                    className="w-full bg-[#141417] hover:bg-[#2a2a2f] text-white h-12 text-base"
                    data-testid="proceed-payment-button"
                  >
                    {handshakeLoading ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Connecting to payment gateway...</>
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        Pay {currencySymbol}{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <CreditCard className="h-3 w-3" /> Credit Card <span className="text-muted-foreground/50">|</span> <Smartphone className="h-3 w-3" /> Bit
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Paying {currencySymbol}{handshakeData?.sum?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowIframe(false); setHandshakeData(null); if (pollRef.current) clearInterval(pollRef.current); }}
                      data-testid="cancel-payment"
                    >
                      Cancel
                    </Button>
                  </div>

                  {/* Hidden form that submits to the iframe */}
                  {handshakeData && (
                    <form
                      ref={formRef}
                      action={iframeBaseUrl}
                      target="tranzila-frame"
                      method="POST"
                      className="hidden"
                      id="tranzila-form"
                    >
                      <input type="hidden" name="sum" value={handshakeData.sum.toFixed(2)} />
                      <input type="hidden" name="currency" value={handshakeData.currency_code} />
                      <input type="hidden" name="new_process" value="1" />
                      <input type="hidden" name="thtk" value={handshakeData.thtk} />
                      <input type="hidden" name="lang" value="us" />
                      <input type="hidden" name="nologo" value="1" />
                      <input type="hidden" name="trBgColor" value="FFFFFF" />
                      <input type="hidden" name="trTextColor" value="141417" />
                      <input type="hidden" name="trButtonColor" value="141417" />
                      <input type="hidden" name="buttonLabel" value="Complete Payment" />
                      <input type="hidden" name="contact" value={paymentData?.client_name || ''} />
                      <input type="hidden" name="pdesc" value={`Job #${paymentData?.job_number} - Bashari Lab-Direct`} />
                      <input type="hidden" name="bit_pay" value="1" />
                      <input type="hidden" name="notify_url_address" value={`${API_URL}/payment/${token}/notify`} />
                    </form>
                  )}

                  <div className="border rounded-lg overflow-hidden bg-white">
                    <iframe
                      name="tranzila-frame"
                      id="tranzila-frame"
                      style={{ width: '100%', height: '500px', border: 'none' }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-amber-800 text-sm font-medium">Payment Gateway (Test Mode)</p>
                <p className="text-muted-foreground text-xs mt-1">Tranzila is not configured. You can simulate a payment for testing.</p>
              </div>
              <Button
                onClick={handleSimulatePayment}
                disabled={simulating}
                className="w-full bg-green-700 hover:bg-green-600 text-white h-12 text-base"
                data-testid="simulate-payment-button"
              >
                {simulating ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Processing...</>
                ) : (
                  <><CreditCard className="h-5 w-5 mr-2" />Simulate Payment (Test)</>
                )}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2">
            Secured by Tranzila &middot; Bashari Lab-Direct
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#141417]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    }>
      <PaymentForm />
    </Suspense>
  );
}
