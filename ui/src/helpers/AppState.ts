import { makeAgoricWalletConnection } from '@agoric/web-components';

import { DamOffer, DoneDeal } from '../helpers/FutarchyTypes';
import AgoricLayer from './AgoricLayer';

type Wallet = Awaited<ReturnType<typeof makeAgoricWalletConnection>>;

export default interface AppState {
  wallet?: Wallet;
  userContractState?: "notjoined" | "active" | "ended"
  contractInstance?: unknown;
  brands?: Record<string, unknown>;
  purses?: Array<Purse>;
  lastId?: string;
  medians: bigint[];
  asks?: Array<DamOffer>;
  bids?: Array<DamOffer>;
  doneDeals: Array<DoneDeal>;
  approved?: boolean;
  joined?: boolean;
  error?: string;
  agoricLayer?: AgoricLayer;
  redeemed?: boolean;
}