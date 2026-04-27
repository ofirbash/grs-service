// Shared constants and pure helper functions for the Jobs page.
import type { Stone, CertificateGroup } from './_types';

export const NOTIFICATION_LABELS: Record<string, string> = {
  stones_accepted: 'Stones Received',
  verbal_uploaded: 'Verbal Results',
  stones_returned: 'Stones Ready',
  cert_uploaded: 'Cert. Scans Available',
  cert_returned: 'Certificates Ready',
};

export const DEFAULT_STONE_TYPES = [
  'Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Alexandrite',
  'Spinel', 'Padparadscha', 'Paraiba', 'Tanzanite', 'Other',
];

export const DEFAULT_SHAPES = [
  'Round', 'Oval', 'Cushion', 'Pear', 'Heart',
  'Marquise', 'Princess', 'Emerald Cut', 'Cabochon', 'Other',
];

export const COMPANY_INFO = {
  displayName: 'Bashari Lab-Direct',
  legalName: 'Eliyahu Bashari Diamonds LTD',
  address: 'Israel Diamond Exchange, Macabbi bld. 23-42, 1 Jabotinsky st. 5252001, Ramat-Gan',
  phones: ['+972-3-7521295', '+972-54-2989805'],
  email: 'grs-il@bashds.com',
  vat: '513180083',
  logoUrl: 'https://customer-assets.emergentagent.com/job_777624e9-9d3b-43c3-b65b-05602d9f9f7d/artifacts/cpw6x0ub_bashari%20logo-square%20copy.jpg',
};

export const SHIPMENT_TYPE_LABELS: Record<string, string> = {
  send_stones_to_lab: 'Send Stones to Lab',
  stones_from_lab: 'Stones from Lab',
  certificates_from_lab: 'Certificates from Lab',
};

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Certificate group label based on stone count
export const getCertificateLabel = (stoneCount: number): string => {
  if (stoneCount === 1) return 'Single';
  if (stoneCount === 2) return 'Pair';
  if (stoneCount >= 3 && stoneCount <= 6) return 'Layout';
  if (stoneCount > 6) return 'Multi-Stone';
  return 'Group';
};

// Organize stones by certificate groups (grouped first, ungrouped last)
export const organizeStonesIntoGroups = (stones: Stone[]): CertificateGroup[] => {
  const groupMap = new Map<number | null, Stone[]>();

  stones.forEach((stone) => {
    const groupKey = stone.certificate_group ?? null;
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey)!.push(stone);
  });

  const groups: CertificateGroup[] = [];

  const groupedEntries = Array.from(groupMap.entries())
    .filter(([key]) => key !== null)
    .sort(([a], [b]) => (a as number) - (b as number));

  groupedEntries.forEach(([groupNumber, groupStones]) => {
    groups.push({
      groupNumber: groupNumber as number,
      stones: groupStones,
      label: getCertificateLabel(groupStones.length),
    });
  });

  const ungroupedStones = groupMap.get(null);
  if (ungroupedStones && ungroupedStones.length > 0) {
    ungroupedStones.forEach((stone) => {
      groups.push({ groupNumber: null, stones: [stone], label: 'Ungrouped' });
    });
  }

  return groups;
};
