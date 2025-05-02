import { useEffect } from 'react';
import { useAgoric } from '@agoric/react-components';

import './App.css';
import {
  makeAgoricChainStorageWatcher,
  AgoricChainStoragePathKind as Kind,
} from '@agoric/rpc';
import { create } from 'zustand';
import {
  makeAgoricWalletConnection,
  suggestChain,
} from '@agoric/web-components';
import { subscribeLatest } from '@agoric/notifier';
import { makeCopyBag } from '@agoric/store';
import { Logos } from './components/Logos';
import { Inventory } from './components/Inventory';
import { Trade } from './components/Trade';
import { OfferList } from './components/OfferList';
import { ContractList } from './components/ContractList';
import { CreateOffer, Offer } from './components/CreateOffer';
import type {
  ContinuingInvitationSpec,
  ContractInvitationSpec
} from '@agoric/smart-wallet/src/invitations';

import { ContractWallet, DamOffer, DoneDeal } from './helpers/FutarchyTypes';

const { entries, fromEntries } = Object;

type Wallet = Awaited<ReturnType<typeof makeAgoricWalletConnection>>;

const url = new URL(window.location.href);

console.log(`Current location: ${url.protocol}://${url.hostname}`);

let ENDPOINTS;

if (url.hostname === 'llm-test.yary.eu') {
  ENDPOINTS = {
    RPC: `${url.protocol}//${url.hostname}/rpc/`,
    API: `${url.protocol}//${url.hostname}/api/`,
  };
} else {
  ENDPOINTS = {
    RPC: `${url.protocol}//${url.hostname}:26657`,
    API: `${url.protocol}//${url.hostname}:1317`,
  };
}
const codeSpaceHostName = import.meta.env.VITE_HOSTNAME;

const codeSpaceDomain = import.meta.env
  .VITE_GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

if (codeSpaceHostName) {
  ENDPOINTS.API = `https://${codeSpaceHostName}-1317.${codeSpaceDomain}`;
  ENDPOINTS.RPC = `https://${codeSpaceHostName}-26657.${codeSpaceDomain}`;
}
if (codeSpaceHostName && codeSpaceDomain) {
  ENDPOINTS.API = `https://${codeSpaceHostName}-1317.${codeSpaceDomain}`;
  ENDPOINTS.RPC = `https://${codeSpaceHostName}-26657.${codeSpaceDomain}`;
} else {
  console.error(
    'Missing environment variables: VITE_HOSTNAME or VITE_GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN',
  );
}

console.log('Endpoints API: ' + ENDPOINTS.API);
console.log('Endpoints RPC: ' + ENDPOINTS.RPC);

const watcher = makeAgoricChainStorageWatcher(ENDPOINTS.API, 'agoriclocal');
interface Note {
  id: number,
  note: String | null,
  address: String | null,
}

interface AppState {
  wallet?: Wallet;
  notesInstance?: unknown;
  brands?: Record<string, unknown>;
  purses?: Array<Purse>;
  latestNote?: number;
  notes?: Array<Note>;
  lastId?: string;
  asks?: Array<DamOffer>;
  bids?: Array<DamOffer>;
  content: {
    cash: Array<number>;
    shares: Array<number>;
  }
  doneDeals: Array<DoneDeal>;
  medians: Array<number>;
  approved?: boolean;
  error?: string;
}

const useAppStore = create<AppState>(() => ({
  content: {cash: [10000, 10000], shares: [10, 10]},
  doneDeals: [],
  medians: [0,0]
}));

const setup = async () => {
  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.instance'],
    instances => {
      const futarchyContracts = instances.find(([name]) => name === 'futarchy');
      
      useAppStore.setState({
        notesInstance: futarchyContracts!.at(1),
      });
    },
  );
  
  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.brand'],
    brands => {
      useAppStore.setState({
        brands: fromEntries(brands),
      });
    },
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.futarchy.latest'],
    (anything) => {
      useAppStore.setState({
        latestNote: parseInt(anything.toString())
      })
    },
  );

  watcher.watchLatest<{value: boolean|undefined}>(
    [Kind.Data, 'published.futarchy.approved'],
    (approvedReceived) => {
      console.log(approvedReceived)
      useAppStore.setState({
        approved: approvedReceived.value
      })
    },
  );

  watcher.watchLatest<Array<number>>(
    [Kind.Data, 'published.futarchy.medians'],
    (medians) => {
      useAppStore.setState({
        medians: medians
      })
    },
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Children, 'published.futarchy.contracts'],
    async (contracts) => {
      let { doneDeals } = useAppStore.getState();

      for (let i = 0; i < contracts.length; i++) {
        const id = contracts[i];

        if (doneDeals.find(dd => dd.id.toString() === id.toString()) != null) {
          continue;
        }

        const result : DoneDeal = await watcher.queryOnce([Kind.Data, `published.futarchy.contracts.${id}`]);
        
        if (doneDeals.find(dd => dd.id.toString() === id.toString()) != null) {
          continue;
        } //Checking twice because the async call in between may cause the insertion of a done deal *after* it has been checked as not existing

        doneDeals.push(result);
      }
    }
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Children, 'published.futarchy.asks'],
    async (allAsks) => {
      let retrievedAsks : Array<DamOffer> = [];

      let result : DamOffer;

      for (let i = 0; i < allAsks.length; i++) {
        const id = allAsks[i];
        result = await watcher.queryOnce([Kind.Data, `published.futarchy.asks.${id}`]);
        if (!result.resolved) {
          retrievedAsks.push(result);
        }
      }

      retrievedAsks.sort((o1, o2) => o2.price - o1.price);

      useAppStore.setState({
        asks: retrievedAsks
      })
    },
  );

  watcher.watchLatest<Array<string>>(
    [Kind.Children, 'published.futarchy.wallets'],
    async (allWallets) => {      
      const { wallet, content } = useAppStore.getState();

      allWallets.forEach(async (address) => {
        if (address != wallet?.address) {
          return;
        }

        const result : ContractWallet = await watcher.queryOnce([Kind.Data, `published.futarchy.wallets.${address}`]);

        useAppStore.setState({
          content: {
            cash: result.cash,
            shares: result.shares
          }
        });
      });

      if (content.cash == null || content.shares == null) {
        useAppStore.setState({
          content: {
            cash: [10000, 10000],
            shares: [100, 100]
          }
        });
      }
    },
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Children, 'published.futarchy.bids'],
    async (allBids) => {
      let retrievedBids : Array<DamOffer> = [];

      let result : DamOffer;

      for (let i = 0; i < allBids.length; i++) {
        const id = allBids[i];
        result = await watcher.queryOnce([Kind.Data, `published.futarchy.bids.${id}`]);
        if (!result.resolved) {
          retrievedBids.push(result);
        }
      }

      retrievedBids.sort((o1, o2) => o2.price - o1.price);

      useAppStore.setState({
        bids: retrievedBids
      })
    },
  );  
};


const connectWallet = async () => {
  await suggestChain('https://local.agoric.net/network-config');
  const wallet = await makeAgoricWalletConnection(watcher, ENDPOINTS.RPC);
  useAppStore.setState({ wallet });
  const { pursesNotifier } = wallet;
  for await (const purses of subscribeLatest<Purse[]>(pursesNotifier)) {
    console.log('got purses', purses);
    useAppStore.setState({ purses });
    const { notesInstance } = useAppStore.getState(); //TODO: get the notes instance

    watcher.watchLatest<Array<[string, unknown]>>(
      [Kind.Data, `published.wallet.${wallet.address}`],
      async (status: any) => {
        if (
          status == null
          || status.updated != "offerStatus"
          || status.status == null
          || status.status.invitationSpec == null
          || status.status.invitationSpec.instance == null
          || status.status.invitationSpec.instance != notesInstance
        ) {
          return;
        }

        console.log(`Was there an error? ${status?.status?.error}`)
        useAppStore.setState({ error: status?.status?.error });

        const result : ContractWallet = await watcher.queryOnce([Kind.Data, `published.futarchy.wallets.${wallet.address}`]);

        console.log(`Showing the content`); 
        console.log(result);

        if (result == null || typeof result !== 'object') {
          return;
        }

        useAppStore.setState({
          content: {
            cash: result.cash,
            shares: result.shares
          }
        });

        useAppStore.setState({
          lastId: status.status.id.toString()
        })
      },
    );
  }
};

const getoffers = (type: string, condition: number) => {
  if (type === 'asks') {
    const { asks } = useAppStore.getState();

    return asks?.filter(a => a.condition === condition);
  } else if (type === 'bids') {
    const { bids } = useAppStore.getState();

    return bids?.filter(b => b.condition === condition);
  }

  console.warn(`Type must be bids|asks. It was ${type}`);
  return [];
}

const getContracts = (condition: number) => {
  const { doneDeals } = useAppStore.getState();

  return doneDeals?.filter(dd => dd.condition === condition);
}

function App() {
  useEffect(() => {
    setup();
  }, []);

  const { wallet, purses, content, medians, approved, error } = useAppStore(({ wallet, purses, content, medians, approved, error }) => ({
    wallet,
    purses,
    content,
    medians,
    approved,
    error
  }));
  const istPurse = purses?.find(p => p.brandPetname === 'IST');
  const itemsPurse = purses?.find(p => p.brandPetname === 'Item');

  const tryConnectWallet = () => {
    connectWallet().catch(err => {
      switch (err.message) {
        case 'KEPLR_CONNECTION_ERROR_NO_SMART_WALLET':
          alert('no smart wallet at that address');
          break;
        default:
          alert(err.message);
      }
    });
  };

  const publishOfferToTheChain = (offer: Offer) => {
    const { wallet, notesInstance } = useAppStore.getState();
    if (!notesInstance) throw Error('no contract instance');
  
    const offerBare = {
      'type': offer.type,
      'amount': 1,
      'price': offer.value,
      'address': wallet?.address,
      'taker': false,
      "condition": offer.condition
    }

    const contractSpec: ContractInvitationSpec = {
      source: 'contract',
      instance: notesInstance,
      publicInvitationMaker: 'makePublishInvitation',
    };

    /*const continuingSpec: ContinuingInvitationSpec = {
      source: 'continuing',
      previousOffer: lastId ? lastId : 'n/a',
      invitationMakerName: 'makePublishInvitation',
    };

    const spec = lastId == null ? contractSpec : continuingSpec;*/
    const spec = contractSpec;

    wallet?.makeOffer(
      spec,
      {},
      {
        offer: offerBare,
      },
      (update: { status: string; data?: unknown }) => {
        //log the update, the offer id might appear here
        if (update.status === 'error') {
          console.log(`Publication error: ${update.data}`);
        }
        if (update.status === 'accepted') {
          console.log('Data published successfully');
          console.log('=================');
          console.log('Full Update Data');
          console.log('=================');
          console.log(update);
          console.log('=================');
        }
        if (update.status === 'refunded') {
          console.log('Publication rejected');
        }
      },
      //Here should go the offer id, if it's the first time
    );
  }

  const publishOffer = (offer: Offer) => {
    publishOfferToTheChain(offer);
  }

  return (
    <>
  
        <Logos />
        <div>{error}</div>
      <h1>Futarchy Dapp {approved == null ? '' : (approved ? '(Approved - Final)' : '(Rejected - Final)')}</h1>

      <div className="row-center">

        {wallet && istPurse &&
        <div className='item-col'>
          <h2 style={{ backgroundColor: medians[1] >= medians[0] ? '' : 'yellow' }}>Status Quo</h2>
          <div className='row-center'>
            <div className='item-col'>
              <div>Median: <b>{medians[0]}</b></div>
              <ContractList
                list={getContracts(0)}
              />
            </div>
            <div className='item-col'>
              <div>
                <b>Wallet</b>
                <ul className='barelist'>
                  <li>Cash: { content?.cash[0] }</li>
                  <li>Shares: { content?.shares[0] }</li>
                </ul>
              </div>
              <div className='item-row'>
                <OfferList
                  type='Asks'
                  address={wallet?.address}
                  list={getoffers('asks', 0)}
                />
              </div>
              <div className='item-row'>
                <OfferList
                  type='Bids'
                  address={wallet?.address}
                  list={getoffers('bids', 0)}
                />
              </div>
            </div>
          </div>
        </div>
        }

        <div className='item-col'>
          <CreateOffer publish={publishOffer}></CreateOffer>
        </div>

        {wallet && istPurse &&
        <div className='item-col'>
          <h2 style={{ backgroundColor: medians[1] >= medians[0] ? 'yellow' : '' }}>Proposal Adopted</h2>
          <div className='row-center'>
            <div className='item-col'>
              <div>
                <b>Wallet</b>
                <ul className='barelist'>
                  <li>Cash: { content?.cash[1] }</li>
                  <li>Shares: { content?.shares[1] }</li>
                </ul>
              </div>
              <div className='item-row'>
                <OfferList
                  type='Asks'
                  address={wallet?.address}
                  list={getoffers('asks', 1)}
                />
              </div>
              <div className='item-row'>
                <OfferList
                  type='Bids'
                  address={wallet?.address}
                  list={getoffers('bids', 1)}
                />
              </div>
            </div>
            <div className='item-col'>
            <div>Median: <b>{medians[1]}</b></div>
              <ContractList
                list={getContracts(1)}
              />
            </div>
          </div>
        </div>
        }
      </div>

      <div className='row-center'>
      <div className='item-col'>
        {wallet && istPurse ? (
          <Inventory
            address={wallet.address}
            istPurse={istPurse}
            itemsPurse={itemsPurse as Purse}
            cash={content?.cash[0]}
            shares={content?.shares[0]}
            condition='Status Quo'
          />
        ) : (
          <div>
            <button onClick={tryConnectWallet}>Connect Wallet</button>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

export default App;
