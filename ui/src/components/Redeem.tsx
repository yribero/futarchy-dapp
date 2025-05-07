import { StoreApi, UseBoundStore } from 'zustand';
import AgoricLayer from '../helpers/AgoricLayer';
import AppState from '../helpers/AppState';
import { ContractInvitationSpec } from '@agoric/smart-wallet/src/invitations';
import { ConnectWallet } from './ConnectWallet';
import { useEffect } from 'react';

type RedeemProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>;
    agoricLayer: AgoricLayer;
    approved: boolean | undefined
}

const Redeem = (({ useAppStore, approved, agoricLayer }: RedeemProps) => {
    const { wallet, contractInstance, purses, redeemed } = useAppStore.getState();

    const updateRedeemed = () =>  {
        const { purses } = useAppStore.getState();
    
        console.log('AM I CALLED?');
        
        if (purses == null) {
            return
        }
    
        let cashPurse;
        let sharesPurse;

        if (approved === false) {
            cashPurse = purses.find(p => p.brandPetname === 'CashNo');
            sharesPurse = purses.find(p => p.brandPetname === 'SharesNo');
        } else if (approved === true) {
            cashPurse = purses.find(p => p.brandPetname === 'CashYes');
            sharesPurse = purses.find(p => p.brandPetname === 'SharesYes');
        }

        const joined = cashPurse?.currentAmount.value != null || sharesPurse?.currentAmount.value != null
        
        console.log('IS IT JOINED?', joined);

        if (!joined) {
            return;
        }

        const redeemed = cashPurse?.currentAmount.value === 0n && sharesPurse?.currentAmount.value === 0n;

        console.log('IS IT REDEEMED?', redeemed);

        useAppStore.setState({ 
            redeemed
        }, false);
    }

    const redeem = async () => {
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

                updateRedeemed();
              }
              if (update.status === 'refunded') {
                console.log('Publication rejected');
              }
            },
            //Here should go the offer id, if it's the first time
          );
    };

    useEffect(() => {
        updateRedeemed();
    }, []);

    if (wallet == null) {
        return (
            <>
                <ConnectWallet useAppStore={useAppStore} agoricLayer={agoricLayer} />
            </>
        );
    }

    {redeemed && console.log('REDEEMED', redeemed)}
    if (redeemed) {
        return (
            <>
                <div className="trade" style={{ width: '100%' }}>
                    <div className='card'>
                        <h2>You have redeemed the share of IST you made. Check your amounts.</h2>
                    </div>
                </div>
            </>
        );
    }
    
    return (
        <>
            <div className="trade" style={{ width: '100%' }}>
                <div className='card'>
                    <h2>By clicking redeem you will exchange your tokens (under the winning condition) for IST. Depending on your market performance, you might get back more or less than you initially deposited.</h2>
                    <button onClick={() => {
                        redeem();
                    }}>Redeem</button>
                </div>
            </div>
        </>
    );
});

export { Redeem };