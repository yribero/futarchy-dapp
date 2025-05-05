import { StoreApi, UseBoundStore } from 'zustand';
import AgoricLayer from '../helpers/AgoricLayer';
import AppState from '../helpers/AppState';
import { ContractInvitationSpec } from '@agoric/smart-wallet/src/invitations';

type JoinProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>,
    agoricLayer: AgoricLayer
}

const Join = (({ useAppStore, agoricLayer }: JoinProps) => {

    const join = async () => {
        const { wallet, contractInstance, brands } = useAppStore.getState();

        if (wallet == null) {
            console.error('Wallet not available');

            await agoricLayer.connectWallet(useAppStore);
        }

        const contractSpec: ContractInvitationSpec = {
            source: 'contract',
            instance: contractInstance,
            publicInvitationMaker: 'joinFutarchy',
        };

        const give = { Price: { brand: brands?.IST, value: 100n * 1_000_000n } };
        const want = {};

        console.log('GIVE', give);
        wallet?.makeOffer(
            contractSpec,
            { give, want },
            undefined,
            (update: { status: string; data?: unknown }) => {
                console.log(update)
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

                useAppStore.setState({joined: true});
                localStorage.setItem('joined', 'yes');
              }
              if (update.status === 'refunded') {
                console.log('Publication rejected');
              }
            },
            //Here should go the offer id, if it's the first time
          );
    };

    return (
        <>
            <div className="trade" style={{ width: 500 }}>
                <div className='card'>
                    <h2>By accepting the joining transaction, you will escrow 100 IST.</h2>
                    <button onClick={() => {
                        join();
                    }}>Join</button>
                </div>
            </div>
        </>
    );
});

export { Join };