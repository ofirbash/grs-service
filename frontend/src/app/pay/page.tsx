"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Gem, Loader2, CheckCircle2, AlertCircle, CreditCard, ArrowRightLeft } from 'lucide-react';
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
  stones: Stone[];
  tranzilla_terminal: string;
  has_tranzilla: boolean;
}

function PaymentForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(3.65);
  const [loadingRate, setLoadingRate] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchPaymentDetails();
    fetchExchangeRate();
  }, [token]);

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
  const tranzillaCurrency = currency === 'USD' ? '2' : '1';

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">Invalid Link</h3>
            <p className="text-navy-600">This payment link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">Error</h3>
            <p className="text-navy-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-xl font-bold text-navy-800 mb-2">Payment Received</h3>
            <p className="text-navy-600 mb-4">
              Thank you! Your payment for Job #{paymentData?.job_number} has been processed successfully.
            </p>
            <Badge className="bg-green-100 text-green-800 text-sm px-4 py-1">Paid</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4 flex items-start justify-center pt-8">
      <Card className="w-full max-w-2xl shadow-2xl" data-testid="payment-card">
        <CardHeader className="text-center border-b border-navy-100 pb-6">
          <div className="mx-auto w-14 h-14 bg-navy-800 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <Gem className="h-7 w-7 text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-navy-800">GRS Global</CardTitle>
          <p className="text-navy-500 text-sm">Secure Payment</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Job Info */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg text-sm">
            <div>
              <Label className="text-navy-500 text-xs">Job</Label>
              <p className="font-bold text-navy-800">#{paymentData?.job_number}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Client</Label>
              <p className="font-medium text-navy-800">{paymentData?.client_name}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Stones</Label>
              <p className="font-medium text-navy-800">{paymentData?.total_stones}</p>
            </div>
          </div>

          {/* Stones Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-navy-50">
                  <TableHead className="text-navy-700 text-xs">SKU</TableHead>
                  <TableHead className="text-navy-700 text-xs">Type</TableHead>
                  <TableHead className="text-navy-700 text-xs">Weight</TableHead>
                  <TableHead className="text-navy-700 text-xs text-right">Fee (USD)</TableHead>
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
          <div className="p-5 bg-navy-50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-navy-700">Payment Currency</Label>
              <div className="flex items-center gap-2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-32 h-9" data-testid="currency-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="ILS">ILS (\u20AA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {currency === 'ILS' && (
              <div className="flex items-center gap-2 text-xs text-navy-500">
                <ArrowRightLeft className="h-3 w-3" />
                <span>
                  Exchange rate: 1 USD = {loadingRate ? '...' : exchangeRate.toFixed(2)} ILS
                </span>
              </div>
            )}

            <div className="text-center pt-2 border-t border-navy-200">
              <p className="text-navy-500 text-sm">Total Amount Due</p>
              <p className="text-4xl font-bold text-navy-900 mt-1" data-testid="payment-amount">
                {currencySymbol}{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Payment Action */}
          {paymentData?.has_tranzilla ? (
            <>
              {!showIframe ? (
                <Button
                  onClick={() => setShowIframe(true)}
                  className="w-full bg-navy-800 hover:bg-navy-700 h-12 text-base"
                  data-testid="proceed-payment-button"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Proceed to Payment
                </Button>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <form
                    action={`https://direct.tranzila.com/${paymentData.tranzilla_terminal}/iframenew.php`}
                    target="tranzila-frame"
                    method="POST"
                    className="hidden"
                    id="tranzila-form"
                  >
                    <input type="hidden" name="sum" value={displayAmount.toFixed(2)} />
                    <input type="hidden" name="currency" value={tranzillaCurrency} />
                    <input type="hidden" name="lang" value="il" />
                    <input type="hidden" name="nologo" value="1" />
                    <input type="hidden" name="contact" value={paymentData.client_name} />
                    <input type="hidden" name="pdesc" value={`Job #${paymentData.job_number} - GRS Global`} />
                    <input type="hidden" name="success_url_address" value={`${window.location.origin}/pay?token=${token}&status=success`} />
                    <input type="hidden" name="fail_url_address" value={`${window.location.origin}/pay?token=${token}&status=fail`} />
                    <input type="hidden" name="notify_url_address" value={`${API_URL}/payment/${token}/notify`} />
                  </form>
                  <iframe
                    name="tranzila-frame"
                    id="tranzila-frame"
                    src={`https://direct.tranzila.com/${paymentData.tranzilla_terminal}/iframenew.php?sum=${displayAmount.toFixed(2)}&currency=${tranzillaCurrency}&lang=il&nologo=1&pdesc=Job%20%23${paymentData.job_number}&success_url_address=${encodeURIComponent(`${window.location.origin}/pay?token=${token}&status=success`)}&fail_url_address=${encodeURIComponent(`${window.location.origin}/pay?token=${token}&status=fail`)}&notify_url_address=${encodeURIComponent(`${API_URL}/payment/${token}/notify`)}`}
                    allow="payment"
                    style={{ width: '100%', height: '500px', border: 'none' }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-amber-800 text-sm font-medium">Payment Gateway (Test Mode)</p>
                <p className="text-amber-700 text-xs mt-1">Tranzilla is not yet configured. You can simulate a payment for testing.</p>
              </div>
              <Button
                onClick={handleSimulatePayment}
                disabled={simulating}
                className="w-full bg-green-700 hover:bg-green-600 h-12 text-base"
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

          <p className="text-center text-xs text-navy-400 pt-2">
            Secured by GRS Global Lab Logistics & ERP System
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    }>
      <PaymentForm />
    </Suspense>
  );
}
