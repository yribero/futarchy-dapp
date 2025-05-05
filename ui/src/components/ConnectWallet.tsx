import { StoreApi, UseBoundStore } from 'zustand';
import AgoricLayer from '../helpers/AgoricLayer';
import AppState from '../helpers/AppState';

type ConnectWalletProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>,
    agoricLayer: AgoricLayer
};

const ConnectWallet = (({ useAppStore, agoricLayer }: ConnectWalletProps) => {
    return (
        <>
            <button onClick={() => {
                agoricLayer.connectWallet(useAppStore);
            }}>Connect Your Wallet</button>
        </>
    );
});

export { ConnectWallet };