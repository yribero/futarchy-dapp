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
        const want = {
            CashNo: { brand: brands?.CashNo, value: 10000n * 1_000_000n },
            CashYes: { brand: brands?.CashYes, value: 10000n * 1_000_000n },
            SharesNo: { brand: brands?.SharesNo, value: 100n * 1_000_000n },
            SharesYes: { brand: brands?.SharesYes, value: 100n * 1_000_000n }
        };

        console.log('GIVE', give);
        console.log('WANT', want);


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

                useAppStore.setState({joined: true}, false);
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
            <div className="trade" style={{ width: '100%' }}>
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