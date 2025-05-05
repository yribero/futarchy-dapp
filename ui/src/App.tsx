import { useEffect } from 'react';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { AgoricChainStoragePathKind as Kind } from '@agoric/rpc';
import './App.css';
import AppState from './helpers/AppState';
import AgoricLayer from './helpers/AgoricLayer';
import { Join } from './components/Join';
import { Logos } from './components/Logos';
import { Inventory } from './components/Inventory';
import { DoneDeal } from './helpers/FutarchyTypes';
import { Futarchy } from './components/Futarchy';
import { ConnectWallet } from './components/ConnectWallet';

const { fromEntries } = Object;

let useAppStore: UseBoundStore<StoreApi<AppState>> = create<AppState>(() => ({
    doneDeals: [], medians: [0n, 0n], bids: [], asks: []
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
        'published.futarchy.outcome',
        (approvedReceived: { result: boolean | undefined }) => {
            if (approvedReceived.result != null) {
                useAppStore.setState({
                    approved: approvedReceived.result
                });
            }
        },
        true
    );
    
    agoricLayer.startWatcher(
        Kind.Children,
        'published.futarchy.doneDeals',
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
}

function App() {
    useEffect(() => {
        setup();
    }, []);

    const state = useAppStore();
    const purses = state.purses?.filter(p => ['IST', 'CashYes', 'CashNo', 'SharesYes', 'SharesNo'].includes(p.brandPetname));

    if (state.wallet == null) {
        return (
            <>
                <h1>Futarchy Dapp</h1>

                <Logos />

                <ConnectWallet useAppStore={useAppStore} agoricLayer={agoricLayer}/>
            </>
        );
    }

    return (
        <>
            <h1>Futarchy Dapp</h1>

            <Logos />
            
            {state.approved == null && state.joined != true &&
                <div>
                    <Join useAppStore={useAppStore} agoricLayer={agoricLayer}/>
                </div>
            }
            {state.approved == null && state.joined == true &&
                <Futarchy useAppStore={useAppStore} agoricLayer={agoricLayer} /> 
            }
            {state.approved != null &&
                <h1>Ended: TODO</h1>
            }
            
            <Inventory
                address={state.wallet.address}
                purses={purses ? purses : []}
            />


        </>
    );
}

export default App;