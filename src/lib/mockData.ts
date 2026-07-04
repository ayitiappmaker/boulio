import type {
  LotteryResult,
  LotteryState,
  SavedRecipient,
  TopUpCarrier,
  TopUpOrder,
  TopUpProduct,
} from './types';

export const lotteryStates: LotteryState[] = [
  'Florida',
  'New York',
  'Georgia',
  'New Jersey',
  'Tennessee',
];

export const latestResults: LotteryResult[] = [
  {
    id: 'fl-p3-1',
    state: 'Florida',
    game: 'Pick 3',
    draw: 'Evening',
    date: '2026-07-03',
    winningNumbers: ['4', '1', '9'],
  },
  {
    id: 'fl-p4-1',
    state: 'Florida',
    game: 'Pick 4',
    draw: 'Evening',
    date: '2026-07-03',
    winningNumbers: ['2', '8', '6', '1'],
  },
  {
    id: 'ny-p3-1',
    state: 'New York',
    game: 'Pick 3',
    draw: 'Midday',
    date: '2026-07-03',
    winningNumbers: ['0', '7', '3'],
  },
  {
    id: 'ga-p4-1',
    state: 'Georgia',
    game: 'Pick 4',
    draw: 'Midday',
    date: '2026-07-02',
    winningNumbers: ['1', '5', '9', '4'],
  },
];

export const historyResults: LotteryResult[] = [
  ...latestResults,
  {
    id: 'nj-p3-1',
    state: 'New Jersey',
    game: 'Pick 3',
    draw: 'Evening',
    date: '2026-07-02',
    winningNumbers: ['8', '2', '0'],
  },
  {
    id: 'tn-p4-1',
    state: 'Tennessee',
    game: 'Pick 4',
    draw: 'Evening',
    date: '2026-07-01',
    winningNumbers: ['6', '3', '1', '7'],
  },
  {
    id: 'fl-p3-2',
    state: 'Florida',
    game: 'Pick 3',
    draw: 'Midday',
    date: '2026-07-01',
    winningNumbers: ['5', '4', '0'],
  },
  {
    id: 'ny-p4-1',
    state: 'New York',
    game: 'Pick 4',
    draw: 'Evening',
    date: '2026-06-30',
    winningNumbers: ['9', '9', '2', '4'],
  },
];

export const topUpProducts: TopUpProduct[] = [
  { id: 'digicel-airtime-5', carrier: 'Digicel', productType: 'airtime', label: '$5', price: 5, serviceFee: 0.99 },
  { id: 'digicel-airtime-10', carrier: 'Digicel', productType: 'airtime', label: '$10', price: 10, serviceFee: 1.49 },
  { id: 'digicel-airtime-20', carrier: 'Digicel', productType: 'airtime', label: '$20', price: 20, serviceFee: 1.99 },
  { id: 'digicel-airtime-50', carrier: 'Digicel', productType: 'airtime', label: '$50', price: 50, serviceFee: 2.99 },
  { id: 'natcom-airtime-5', carrier: 'Natcom', productType: 'airtime', label: '$5', price: 5, serviceFee: 0.99 },
  { id: 'natcom-airtime-10', carrier: 'Natcom', productType: 'airtime', label: '$10', price: 10, serviceFee: 1.49 },
  { id: 'natcom-airtime-20', carrier: 'Natcom', productType: 'airtime', label: '$20', price: 20, serviceFee: 1.99 },
  { id: 'natcom-airtime-50', carrier: 'Natcom', productType: 'airtime', label: '$50', price: 50, serviceFee: 2.99 },
  { id: 'digicel-data-1', carrier: 'Digicel', productType: 'data', label: '1GB', price: 6, serviceFee: 0.99 },
  { id: 'digicel-data-3', carrier: 'Digicel', productType: 'data', label: '3GB', price: 12, serviceFee: 1.49 },
  { id: 'digicel-data-5', carrier: 'Digicel', productType: 'data', label: '5GB', price: 18, serviceFee: 1.99 },
  { id: 'digicel-data-10', carrier: 'Digicel', productType: 'data', label: '10GB', price: 30, serviceFee: 2.99 },
  { id: 'natcom-data-1', carrier: 'Natcom', productType: 'data', label: '1GB', price: 6, serviceFee: 0.99 },
  { id: 'natcom-data-3', carrier: 'Natcom', productType: 'data', label: '3GB', price: 12, serviceFee: 1.49 },
  { id: 'natcom-data-5', carrier: 'Natcom', productType: 'data', label: '5GB', price: 18, serviceFee: 1.99 },
  { id: 'natcom-data-10', carrier: 'Natcom', productType: 'data', label: '10GB', price: 30, serviceFee: 2.99 },
];

export const savedRecipients: SavedRecipient[] = [
  {
    id: 'rec-1',
    name: 'Mika',
    carrier: 'Digicel',
    phoneNumber: '(509) 34-12-44-11',
  },
  {
    id: 'rec-2',
    name: 'Jean',
    carrier: 'Natcom',
    phoneNumber: '(509) 35-89-10-07',
  },
  {
    id: 'rec-3',
    name: 'Aline',
    carrier: 'Digicel',
    phoneNumber: '(509) 33-01-77-22',
  },
];

export const topUpOrders: TopUpOrder[] = [
  {
    id: 'ord-1',
    carrier: 'Digicel',
    productType: 'airtime',
    productLabel: '$20',
    phoneNumber: '(509) 34-12-44-11',
    price: 20,
    serviceFee: 1.99,
    total: 21.99,
    status: 'Pending',
    createdAt: '2026-07-03',
  },
  {
    id: 'ord-2',
    carrier: 'Natcom',
    productType: 'data',
    productLabel: '3GB',
    phoneNumber: '(509) 35-89-10-07',
    price: 12,
    serviceFee: 1.49,
    total: 13.49,
    status: 'Delivered',
    createdAt: '2026-07-01',
  },
];

export const preferredLotteryState: LotteryState = 'Florida';

export const carrierCopy: Record<TopUpCarrier, string> = {
  Digicel: 'Strong coverage across Haiti',
  Natcom: 'Reliable choice for quick airtime',
};
