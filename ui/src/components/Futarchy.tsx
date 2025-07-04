import { useEffect, useState } from 'react';
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
import { DamOffer, DoneDeal } from '../helpers/FutarchyTypes';
import { formatBigInt } from '../helpers/helpers';

type FutarchyProps = {
    useAppStore: UseBoundStore<StoreApi<AppState>>,
    agoricLayer: AgoricLayer
}

const Futarchy = (({ useAppStore, agoricLayer }: FutarchyProps) => {

    const { wallet, purses, medians, brands, doneDeals, bids, asks } = useAppStore.getState();

    const [offers, setOffers] = useState<DamOffer[]>([]);

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
            throw new Error('No brands available');
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

    const getoffers = (type: string, condition: number) => {
        return offers
            .filter(a => a.condition === condition)
            .filter(a => a.type === type);
    }

    const setup = () => {
        agoricLayer.startWatcher<Array<bigint>>(Kind.Data, 'published.futarchy.medians', (mediansUpdate) => {
            console.log('MEDIANS UPDATE', mediansUpdate);
            console.log('MEDIANS UPDATE TYPE', typeof mediansUpdate);

            if (typeof mediansUpdate != 'object') {
                return;
            }

            useAppStore.setState({ medians: mediansUpdate }, false);
        }, true);

        agoricLayer.startWatcher<Array<[string, unknown]>>(Kind.Data, 'published.agoricNames.brand', (brandsUpdate) => {
            useAppStore.setState({ brands: Object.fromEntries(brandsUpdate) }, false);
        }, true);

        agoricLayer.startWatcher<Array<[DamOffer]>>(Kind.Children, 'published.futarchy.offers', async (offersUpdate) => {
            const retrievedOffers: Array<DamOffer> = [];

            for (let i = 0; i < offersUpdate.length; i++) {
                const id = offersUpdate[i];

                const offer: DamOffer = await agoricLayer.queryOnce<DamOffer>(Kind.Data, `published.futarchy.offers.${id}`);

                setOffers(offers.filter(a => a.id != offer.id));

                if (offer.available) {
                    retrievedOffers.push(offer);
                }

            }

            setOffers(retrievedOffers);
        }, true);

        agoricLayer.startWatcher(
            Kind.Children,
            'published.futarchy.doneDeals',
            async (doneDealsUpdate: Array<[string, unknown]>) => {
                console.log('DONE DEAL UPDATE', doneDealsUpdate);

                let { doneDeals } = useAppStore.getState();

                const newList: DoneDeal[] = [];

                for (let i = 0; i < doneDealsUpdate.length; i++) {
                    const id = doneDealsUpdate[i];

                    let existing: DoneDeal | undefined = doneDeals.find(dd => dd.id.toString() === id.toString());

                    if (existing != null) {
                        newList.push(existing);
                        continue;
                    }

                    const result: DoneDeal = await agoricLayer.queryOnce<DoneDeal>(Kind.Data, `published.futarchy.doneDeals.${id}`);

                    console.log('DONE DEAL', result);

                    existing = doneDeals.find(dd => dd.id.toString() === id.toString());

                    if (existing!= null) {
                        newList.push(existing);
                        continue;
                    } //Checking twice because the async call in between may cause the insertion of a done deal *after* it has been checked as not existing

                    newList.push(result);
                }

                useAppStore.setState({ doneDeals: newList }, false);
            },
            true
        );
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
                <div className="trade" style={{ width: '100%' }}>
                    <div className='card'>
                        <h2>Trade in both markets. The median value of the last seven deals in each market will decide the outcome: the highest price win, the proposal goes through in can of parity.</h2>
                    </div>
                </div>
            </div>

            <div className="row-center">

                <div className='item-col'>
                    <h2 style={{ backgroundColor: medians[1] >= medians[0] ? '' : 'yellow' }}>Status Quo</h2>
                    <div className='row-center'>
                        <div className='item-col'>
                            <div>Median: <b>{formatBigInt(medians[0])}</b></div>
                            <ContractList
                                list={doneDeals.filter(dd => dd.condition === 0)}
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
                                    type='ask'
                                    address={wallet?.address}
                                    list={offers}
                                    condition={0}
                                    useAppStore={useAppStore}
                                />
                            </div>
                            <div className='item-row'>
                                <OfferList
                                    type='bid'
                                    address={wallet?.address}
                                    list={offers}
                                    condition={0}
                                    useAppStore={useAppStore}
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
                                    type='ask'
                                    address={wallet?.address}
                                    list={offers}
                                    condition={1}
                                    useAppStore={useAppStore}
                                />
                            </div>
                            <div className='item-row'>
                                <OfferList
                                    type='bid'
                                    address={wallet?.address}
                                    list={offers}
                                    condition={1}
                                    useAppStore={useAppStore}
                                />
                            </div>
                        </div>
                        <div className='item-col'>
                            <div>Median: <b>{formatBigInt(medians[1])}</b></div>
                            <ContractList
                                list={doneDeals.filter(dd => dd.condition === 1)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
});

export { Futarchy };