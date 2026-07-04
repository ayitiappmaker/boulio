export type LotteryGame = 'Pick 3' | 'Pick 4';

export type LotteryState = 'Florida' | 'New York' | 'Georgia' | 'New Jersey' | 'Tennessee';

export type LotteryDraw = 'Midday' | 'Evening';

export type UserMode = 'haiti_user' | 'diaspora_supporter';

export type LotteryResult = {
  id: string;
  state: LotteryState;
  game: LotteryGame;
  draw: LotteryDraw;
  date: string;
  winningNumbers: string[];
};

export type TopUpCarrier = 'Digicel' | 'Natcom';

export type TopUpProduct = {
  id: string;
  carrier: TopUpCarrier;
  productType: 'airtime' | 'data';
  label: string;
  price: number;
  serviceFee: number;
};

export type TopUpOrder = {
  id: string;
  carrier: TopUpCarrier;
  productType: 'airtime' | 'data';
  productLabel: string;
  phoneNumber: string;
  price: number;
  serviceFee: number;
  total: number;
  status: 'Pending' | 'Delivered';
  createdAt: string;
};

export type SavedRecipient = {
  id: string;
  name: string;
  carrier: TopUpCarrier;
  phoneNumber: string;
};
