import { useEffect } from 'react';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { AgoricChainStoragePathKind as Kind } from '@agoric/rpc';
import './App.css';
import AppState from './helpers/AppState';
import AgoricLayer from './helpers/AgoricLayer';
import { Join } from './components/Join';
import { Logos } from './components/Logos';
import { Inventory } from './components/Inventory';
import { DamOffer, DoneDeal } from './helpers/FutarchyTypes';

const { fromEntries } = Object;

let useAppStore: UseBoundStore<StoreApi<AppState>> = create<AppState>(() => ({
    doneDeals: [],
    medians: [0, 0]
}));

let agoricLayer : AgoricLayer;

const setup = async () => {
    agoricLayer = new AgoricLayer(new URL(window.location.href));

    agoricLayer.startWatcher(
        Kind.Data,
        'published.agoricNames.instance',
        (instances: Array<[string, unknown]>) => {
            const futarchyContracts = instances.find(([name]) => name === 'futarchy');

            useAppStore.setState({
                contractInstance: futarchyContracts!.at(1),
            });
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Data,
        'published.agoricNames.brand',
        (brands: Array<[string, unknown]>) => {
            useAppStore.setState({
                brands: fromEntries(brands),
            });
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Data,
        'published.futarchy.approved',
        (approvedReceived: { value: boolean | undefined }) => {
            if (approvedReceived.value != null) {
                useAppStore.setState({
                    approved: approvedReceived.value
                });
            }
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Data,
        'published.futarchy.medians',
        (medians: Array<number>) => {
            useAppStore.setState({
                medians: medians
            })
        },
        true
    );
    
    agoricLayer.startWatcher(
        Kind.Children,
        'published.futarchy.contracts',
        async (contracts: Array<[string, unknown]>) => {
            let { doneDeals } = useAppStore.getState();
    
            for (let i = 0; i < contracts.length; i++) {
              const id = contracts[i];
      
              if (doneDeals.find(dd => dd.id.toString() === id.toString()) != null) {
                continue;
              }
      
              const result : DoneDeal = await agoricLayer.queryOnce<DoneDeal>(Kind.Data, `published.futarchy.contracts.${id}`);
              
              if (doneDeals.find(dd => dd.id.toString() === id.toString()) != null) {
                continue;
              } //Checking twice because the async call in between may cause the insertion of a done deal *after* it has been checked as not existing
      
              doneDeals.push(result);
            }
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Children,
        'published.futarchy.asks',
        async (allAsks: Array<[string, unknown]>) => {
            let retrievedAsks : Array<DamOffer> = [];
        
            let result : DamOffer;
        
            for (let i = 0; i < allAsks.length; i++) {
                const id = allAsks[i];
                result = await agoricLayer.queryOnce<DamOffer>(Kind.Data, `published.futarchy.asks.${id}`);
                if (!result.resolved) {
                retrievedAsks.push(result);
                }
            }
        
            retrievedAsks.sort((o1, o2) => o2.price - o1.price);
        
            useAppStore.setState({
                asks: retrievedAsks
            })
        },
        true
    );
    
    agoricLayer.startWatcher(
        Kind.Children,
        'published.futarchy.bids',
        async (allBids: Array<[string, unknown]>) => {
            let retrievedBids : Array<DamOffer> = [];
      
            let result : DamOffer;
      
            for (let i = 0; i < allBids.length; i++) {
              const id = allBids[i];
              result = await agoricLayer.queryOnce<DamOffer>(Kind.Data, `published.futarchy.bids.${id}`);
              if (!result.resolved) {
                retrievedBids.push(result);
              }
            }
      
            retrievedBids.sort((o1, o2) => o2.price - o1.price);
      
            useAppStore.setState({
              bids: retrievedBids
            })
        },
        true
    );
}

function App() {
    useEffect(() => {
        setup();
    }, []);

    const state = useAppStore();
    const purses = state.purses?.filter(p => ['IST', 'CashYes', 'CashNo', 'SharesYes', 'SharesNo'].includes(p.brandPetname));

    return (
        <>
            <h1>Futarchy Dapp</h1>

            <Logos />
            
            {state.wallet && state.approved == null && state.joined != true &&
                <div>
                    <Join useAppStore={useAppStore} agoricLayer={agoricLayer}/>
                </div>
            }
            {state.wallet && state.approved == null && state.joined == true &&
                <h1>Contract Active: TODO</h1>
            }
            {state.wallet && state.approved != null &&
                <h1>Ended: TODO</h1>
            }
            
            {state.wallet ? (
                <Inventory
                    address={state.wallet.address}
                    purses={purses ? purses : []}
                />
            ) : (
                <div>
                    <button onClick={() => {
                        agoricLayer.connectWallet(useAppStore);
                    }}>Connect Your Wallet</button>
                </div>
            )}

        </>
    );
}

export default App;