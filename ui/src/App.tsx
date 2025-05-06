import { useEffect } from 'react';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { AgoricChainStoragePathKind as Kind } from '@agoric/rpc';
import './App.css';
import AppState from './helpers/AppState';
import AgoricLayer from './helpers/AgoricLayer';
import { Join } from './components/Join';
import { Logos } from './components/Logos';
import { Inventory } from './components/Inventory';
import { Futarchy } from './components/Futarchy';
import { ConnectWallet } from './components/ConnectWallet';
import { Redeem } from './components/Redeem';

const { fromEntries } = Object;

let useAppStore: UseBoundStore<StoreApi<AppState>> = create<AppState>(() => ({
    doneDeals: [], medians: [0n, 0n], bids: [], asks: [], approved: undefined
}));

let agoricLayer : AgoricLayer = new AgoricLayer(new URL(window.location.href));

const updateJoined = () =>  {
    const { purses } = useAppStore.getState();

    if (purses == null) {
        return
    }

    const cashYesPurse : Purse| undefined = purses.find(p => p.brandPetname === 'CashYes');
    const cashNoPurse = purses.find(p => p.brandPetname === 'CashNo');

    console.log("CASHYES purse AMOUNT", cashYesPurse?.currentAmount)
    console.log("CASHNO purse AMOUNT", cashNoPurse?.currentAmount)

    useAppStore.setState({
        joined: cashYesPurse?.currentAmount.value != null || cashNoPurse?.currentAmount.value != null,
    }, false);
}

const setup = async () => {
    updateJoined();

    agoricLayer.startWatcher(
        Kind.Data,
        'published.agoricNames.instance',
        (instances: Array<[string, unknown]>) => {
            const futarchyContracts = instances.find(([name]) => name === 'futarchy');

            useAppStore.setState({ contractInstance: futarchyContracts!.at(1) }, false);
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Data,
        'published.agoricNames.brand',
        (brands: Array<[string, unknown]>) => {
            useAppStore.setState({ brands: fromEntries(brands) }, false);
        },
        true
    );

    agoricLayer.startWatcher(
        Kind.Data,
        'published.futarchy.outcome',
        (approvedReceived: { result: boolean | undefined }) => {
            if (approvedReceived.result != null) {
                console.log('OUTCOME', approvedReceived)
                useAppStore.setState({ approved: approvedReceived.result }, false);
                console.log ('SEE IF IT IS APPROVED', useAppStore.getState().approved);
            }
        },
        true
    );
}

function App() {
    useEffect(() => {
        setup();
    }, []);

    const { wallet, purses, joined, approved } = useAppStore(({ wallet, purses, joined, approved }) => ({
        wallet,
        purses,
        joined,
        approved
    }));

    const pursesOfInterest = purses?.filter(p => ['IST', 'CashYes', 'CashNo', 'SharesYes', 'SharesNo', 'Price'].includes(p.brandPetname));

    if (wallet == null) {
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

            {approved == null && joined != true &&
                <div>
                    <Join useAppStore={useAppStore} agoricLayer={agoricLayer}/>
                </div>
            }

            {approved == null && joined == true &&
                <Futarchy useAppStore={useAppStore} agoricLayer={agoricLayer} /> 
            }

            {approved != null &&
                <Redeem useAppStore={useAppStore} agoricLayer={agoricLayer} approved={approved}/>
            }

            <Inventory
                address={wallet.address}
                purses={pursesOfInterest ? pursesOfInterest : []}
            />


        </>
    );
}

export default App;