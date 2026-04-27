import React from 'react';
import { Send, Gem, FileCheck2, Truck, ArrowRight } from 'lucide-react';
import { SHIPMENT_TYPE_LABELS, SHIPMENT_STATUS_LABELS } from '../_helpers';

export const ShipmentTypeIcon = ({
  type,
  className = 'h-3.5 w-3.5',
}: {
  type: string;
  className?: string;
}) => {
  switch (type) {
    case 'send_stones_to_lab':
      return <Send className={className} strokeWidth={2} />;
    case 'stones_from_lab':
      return <Gem className={className} strokeWidth={2} />;
    case 'certificates_from_lab':
      return <FileCheck2 className={className} strokeWidth={2} />;
    default:
      return <Truck className={className} strokeWidth={2} />;
  }
};

interface ShipmentChipProps {
  info: {
    shipment_number: number;
    shipment_type: string;
    status: string;
    courier?: string;
    tracking_number?: string;
    source_address?: string;
    destination_address?: string;
  };
  compact?: boolean;
}

export const ShipmentChip: React.FC<ShipmentChipProps> = ({ info, compact = false }) => {
  const statusStyles: Record<string, string> = {
    pending: 'bg-navy-100 text-navy-800 border-navy-200',
    in_transit: 'bg-navy-900 text-white border-navy-900',
    delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
  };
  const typeLabel = SHIPMENT_TYPE_LABELS[info.shipment_type] || info.shipment_type;
  const statusLabel = SHIPMENT_STATUS_LABELS[info.status] || info.status;
  const tooltip = [
    typeLabel,
    `#${info.shipment_number}`,
    statusLabel,
    info.source_address && info.destination_address
      ? `${info.source_address} → ${info.destination_address}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (compact) {
    const shortStatusStyles: Record<string, string> = {
      pending: 'bg-navy-100 text-navy-800',
      in_transit: 'bg-navy-900 text-white',
      delivered: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-red-100 text-red-700',
    };
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap" title={tooltip}>
        <span className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-navy-900">
          <ShipmentTypeIcon type={info.shipment_type} className="h-3 w-3" />
          #{info.shipment_number}
        </span>
        <span
          className={
            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ' +
            (shortStatusStyles[info.status] || shortStatusStyles.pending)
          }
        >
          {statusLabel}
        </span>
      </span>
    );
  }

  return (
    <div className="relative group inline-flex flex-col gap-1" title={tooltip}>
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-navy-900">
          <ShipmentTypeIcon type={info.shipment_type} />
          #{info.shipment_number}
        </span>
        <span
          className={
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ' +
            (statusStyles[info.status] || statusStyles.pending)
          }
        >
          {statusLabel}
        </span>
      </div>
      {(info.source_address || info.destination_address) && (
        <div className="flex items-center gap-1 text-[10px] text-navy-500 max-w-[180px] truncate">
          <span className="truncate">{info.source_address || '?'}</span>
          <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{info.destination_address || '?'}</span>
        </div>
      )}
    </div>
  );
};
