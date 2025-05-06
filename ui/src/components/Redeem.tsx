import { StoreApi, UseBoundStore } from 'zustand';
import AgoricLayer from '../helpers/AgoricLayer';
import AppState from '../helpers/AppState';
import { ContractInvitationSpec } from '@agoric/smart-wallet/src/invitations';

type RedeemProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>;
    agoricLayer: AgoricLayer;
    approved: boolean | undefined
}

const Redeem = (({ useAppStore, approved, agoricLayer }: RedeemProps) => {

    const redeem = async () => {
        const { wallet, contractInstance, brands, purses } = useAppStore.getState();

        const pursesOfInterest = purses?.filter(p => ['IST', 'CashYes', 'CashNo', 'SharesYes', 'SharesNo'].includes(p.brandPetname));

        const getPurse = (asset: string) : Purse | undefined => {
            return purses?.find(p => p.brandPetname === asset)
        }

        if (wallet == null) {
            console.error('Wallet not available');

            await agoricLayer?.connectWallet(useAppStore);
        }

        const contractSpec: ContractInvitationSpec = {
            source: 'contract',
            instance: contractInstance,
            publicInvitationMaker: 'redeem',
        };

        let give;
        const want = {};

        if (approved) {
            give = {
                CashYes: getPurse('CashYes')?.currentAmount,
                SharesYes: getPurse('SharesYes')?.currentAmount
            }
        } else {
            give = {
                CashNo: getPurse('CashNo')?.currentAmount ,
                SharesNo: getPurse('SharesNo')?.currentAmount
            }
        }

        console.log('GIVE', give);
        wallet?.makeOffer(
            contractSpec,
            { give, want },
            {},
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
                    <button onClick={() => {
                        redeem();
                    }}>Redeem</button>
                </div>
            </div>
        </>
    );
});

export { Redeem };