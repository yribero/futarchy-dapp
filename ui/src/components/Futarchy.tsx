import { useEffect } from 'react';
import { StoreApi, UseBoundStore } from 'zustand';
import type { ContractInvitationSpec } from '@agoric/smart-wallet/src/invitations';
import { stringifyAmountValue } from '@agoric/ui-components';
import { AgoricChainStoragePathKind as Kind } from '@agoric/rpc';

import AgoricLayer from '../helpers/AgoricLayer';
import AppState from '../helpers/AppState';
import { ConnectWallet } from './ConnectWallet';
import { ContractList } from './ContractList';
import { OfferList } from './OfferList';
import { CreateOffer, Offer } from './CreateOffer';
import { DamOffer } from '../helpers/FutarchyTypes';

type FutarchyProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>,
    agoricLayer: AgoricLayer
}

const Futarchy = (({ useAppStore, agoricLayer }: FutarchyProps) => {

    const { wallet, purses, medians, brands, asks, bids } = useAppStore.getState();

    /*let medians: number[] = [0, 0];
    let brands: Record<string, unknown>;
    let asks: DamOffer[] = [];
    let bids: DamOffer[] = [];*/

    const getStringAmount = (brandPetname: string): string => {
        const purse = purses?.find(p => p.brandPetname === brandPetname);

        if (purse == null) {
            return "n/a";
        }

        return stringifyAmountValue(
            purse?.currentAmount,
            purse?.displayInfo.assetKind,
            purse.brandPetname === 'IST' ? purse?.displayInfo.decimalPlaces : 6,
        );
    }

    const makeAmount = (asset: string, value: bigint) => {
        if (brands == null) {
            throw new Error ('No brands available');
        }

        return {
            [asset]: {
                brand: brands[asset],
                value
            }
        };
    }

    const publishOffer = (offer: Offer) => {
        const { wallet, contractInstance } = useAppStore.getState();

        if (!contractInstance)
            throw Error('no contract instance');

        const proposal = {
            give: {},
            want: {}
        }

        const UNIT6 = 1_000_000n;

        if (offer.type === 'bid') {
            if (offer.condition === 0) {
                proposal.give = makeAmount("CashNo", BigInt(offer.value) * UNIT6);
                proposal.want = makeAmount("SharesNo", UNIT6);
            } else {
                proposal.give = makeAmount("CashYes", BigInt(offer.value) * UNIT6);
                proposal.want = makeAmount("SharesYes", UNIT6);
            }
        } else {
            if (offer.condition === 0) {
                proposal.give = makeAmount("SharesNo", UNIT6);
                proposal.want = makeAmount("CashNo", BigInt(offer.value) * UNIT6);
            } else {
                proposal.give = makeAmount("SharesYes", UNIT6);
                proposal.want = makeAmount("CashYes", BigInt(offer.value) * UNIT6);
            }
        }

        console.log(proposal);

        const contractSpec: ContractInvitationSpec = {
            source: 'contract',
            instance: contractInstance,
            publicInvitationMaker: 'makeOffer',
        };

        wallet?.makeOffer(
            contractSpec,
            proposal,
            {
                "address": wallet?.address,
                "secret": wallet?.address,
                'taker': false
            },
            (update: { status: string; data?: unknown }) => {
                console.log('UPDATE', update);

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

    const getContracts = (condition: number) => {
        const { doneDeals } = useAppStore.getState();

        return doneDeals?.filter(dd => dd.condition === condition);
    }

    const getoffers = (type: string, condition: number) => {
        if (type === 'asks') {
            return asks?.filter(a => a.condition === condition);
        } else if (type === 'bids') {
            console.log('BIDS', bids);
            return bids?.filter(b => b.condition === condition);
        }

        console.warn(`Type must be bids|asks. It was ${type}`);
        return [];
    }

    const setup = () => {
        agoricLayer.startWatcher<Array<bigint>>(Kind.Data, 'published.dam.medians', (mediansUpdate) => {
            console.log('MEDIANS UPDATE', mediansUpdate);
            console.log('MEDIANS UPDATE TYPE', typeof mediansUpdate);

            if (typeof mediansUpdate != 'object') {
                return;
            }

            useAppStore.setState({ medians: mediansUpdate });
        }, true);

        agoricLayer.startWatcher<Array<[string, unknown]>>(Kind.Data, 'published.agoricNames.brand', (brandsUpdate) => {
            useAppStore.setState({ brands: Object.fromEntries(brandsUpdate) });
        }, true);

        agoricLayer.startWatcher<Array<[DamOffer]>>(Kind.Children, 'published.futarchy.offers', async (offers) => {
            console.log('OFFERS', offers)
            for (let i = 0; i < offers.length; i++) {
                const id = offers[i];

                const offer: DamOffer = await agoricLayer.queryOnce<DamOffer>(Kind.Data, `published.futarchy.offers.${id}`);

                console.log('OFFER LOADED', offer);

                let bucket;

                if (offer.type === 'ask') {
                    bucket = asks;
                } else {
                    bucket = bids;
                }

                if (bucket == null) {
                    throw new Error (`No state container associated with type ${offer.type}`);
                }

                const index = bucket.findIndex(a => a.id === offer.id);

                if (index >= 0) {
                    bucket.splice(index, 1);
                }

                if (offer.available) {
                    if (offer.type === 'ask') {
                        useAppStore.setState({ asks: [...bucket, offer]});
                    } else {
                        useAppStore.setState({ bids: [...bucket, offer]});
                    }
                }
              }
        }, true);
    }

    useEffect(() => {
        setup();
    }, []);

    if (wallet == null) {
        return (
            <>
                <ConnectWallet useAppStore={useAppStore} agoricLayer={agoricLayer} />
            </>
        );
    }

    return (
        <>
            <div className="row-center">

                <div className='item-col'>
                    <h2 style={{ backgroundColor: medians[1] >= medians[0] ? '' : 'yellow' }}>Status Quo</h2>
                    <div className='row-center'>
                        <div className='item-col'>
                            <div>Median: <b>{medians[0].toString()}</b></div>
                            <ContractList
                                list={getContracts(0)}
                            />
                        </div>
                        <div className='item-col'>
                            <div className='item-row'>
                                <b>Wallet</b>
                                <div className='barelist'>
                                    <table>
                                        <thead></thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ textAlign: 'left' }}>Cash</td>
                                                <td style={{ textAlign: 'right' }}><b>{getStringAmount('CashNo')}</b></td>
                                            </tr>
                                            <tr>
                                                <td style={{ textAlign: 'left' }}>Shares</td>
                                                <td style={{ textAlign: 'right' }}><b>{getStringAmount('SharesNo')}</b></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
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
                                    list={ bids?.filter(b => b.condition === 0) }
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className='item-col'>
                    <CreateOffer publish={publishOffer}></CreateOffer>
                </div>

                <div className='item-col'>
                    <h2 style={{ backgroundColor: medians[1] >= medians[0] ? 'yellow' : '' }}>Proposal Adopted</h2>
                    <div className='row-center'>
                        <div className='item-col'>
                            <div className='item-row'>
                                <b>Wallet</b>
                                <table>
                                    <thead></thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ textAlign: 'left' }}>Cash</td>
                                            <td style={{ textAlign: 'right' }}><b>{getStringAmount('CashYes')}</b></td>
                                        </tr>
                                        <tr>
                                            <td style={{ textAlign: 'left' }}>Shares</td>
                                            <td style={{ textAlign: 'right' }}><b>{getStringAmount('SharesYes')}</b></td>
                                        </tr>
                                    </tbody>
                                </table>
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
                                    list={ bids?.filter(b => b.condition === 1) }
                                />
                            </div>
                        </div>
                        <div className='item-col'>
                            <div>Median: <b>{medians[1].toString()}</b></div>
                            <ContractList
                                list={getContracts(1)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
});

export { Futarchy };