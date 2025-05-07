import { StoreApi, UseBoundStore } from "zustand";
import AppState from "../helpers/AppState";
import { DamOffer } from "../helpers/FutarchyTypes";
import type { ContractInvitationSpec } from '@agoric/smart-wallet/src/invitations';

type OfferListProps = {
    type: string;
    address: string;
    list: Array<DamOffer> | undefined;
    useAppStore: UseBoundStore<StoreApi<AppState>>
    condition: number;
}

const OfferList = (({ list, type, address, useAppStore, condition }: OfferListProps) => {

    const UNIT6 = 1_000_000n;

    const cancelOffer = (offer: DamOffer) => {
        const { wallet, contractInstance } = useAppStore.getState();

        if (!contractInstance)
            throw Error('no contract instance');

        const contractSpec: ContractInvitationSpec = {
            source: 'contract',
            instance: contractInstance,
            publicInvitationMaker: 'cancelOffer',
        };

        wallet?.makeOffer(
            contractSpec,
            {
                give: {},
                want: {}
            },
            {
                "id": offer.id,
                "secret": wallet?.address //TODO: use a sha of a password
            },
            (update: { status: string; data?: unknown }) => {
                console.log('UPDATE', update);

                //log the update, the offer id might appear here
                if (update.status === 'error') {
                    console.log(`Publication error: ${update.data}`);
                }
                if (update.status === 'accepted') {
                    list?.splice(list?.findIndex(o => o.id === offer.id), 1);
                    console.log('THE SERVER ACCEPTED THE OFFER TO CANCEL', offer.id);
                }
                if (update.status === 'refunded') {
                    console.log('Publication rejected');
                    console.log('THE SERVER REFUSED TO CANCEL', offer.id);
                }
            }
        );
    }

    return (
        <>
            <div className="trade" style={{ width: 150 }}>
                <b>{type === 'ask' ? 'Asks' : 'Bids'} ({list?.length})</b>
                <ul className="barelist">
                    {list ? list.filter(o => o.condition === condition).filter(o => o.type === type).map((offer) => {
                        return <li key={ offer.id }>{(offer.price / UNIT6).toString()} {offer.address === address && (
                            <a href='#' onClick={() => { cancelOffer(offer) }} style={{ color: 'red' }}>&#215;</a>
                        )}</li>
                    }): ''}
                </ul>
            </div>
        </>
    );
});

export { OfferList };