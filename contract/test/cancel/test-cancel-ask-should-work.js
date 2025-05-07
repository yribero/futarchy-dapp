import { test as anyTest } from '../prepare-test-env-ava.js';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';

import { UNIT6, makeTestContext, createInstance, joinFutarchyAndMakeOffers, cancelOffer } from '../boiler-plate.js';

/** @typedef {typeof import('../../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * @typedef {{
*   zoe: import ("@agoric/zoe").ZoeService,
*   bundle: any,
*   bundleCache: BundleCache,
*   feeMintAccess: import ("@agoric/zoe").FeeMintAccess
* }} TestContext
*/
const test = /** @type {import('ava').TestFn<TestContext>}} */ (anyTest);

/** @import {RemoteOffer} from '../boiler-plate.js'*/

test.before(async t => (t.context = await makeTestContext(t)));

test('Canceling an ask', async t => {
    const { zoe } = t.context;

    const { instance, chainStorage }  = await createInstance(t);

    const { brands } = await E(zoe).getTerms(instance);

    let ex;

    const expectedResponses = [
        {
            address: 'a',
            amount: 1000000n,
            total: 100000000n,
            condition: 1,
            id: 0n,
            price: 100000000n,
            available: undefined,
            taker: false,
            timestamp: 0n,
            type: 'ask',
            secret: undefined
        }
    ];

    /**
     * @type {import("@agoric/zoe").UserSeat | undefined}
     */
    let seatA;

    /**
     * @type{RemoteOffer[]}
     */
    const remoteOffers = [
        {
            proposal: {
                give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
                want: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) }
            },
            args: {
                address: "a",
                secret: "a",
                taker: false
            },
            user: "a",
            seatHook: async (seat) => {
                seatA = seat;
            }
        }
    ];

    try {
        await joinFutarchyAndMakeOffers(t, instance, remoteOffers);

        console.log('KEYS', await E(chainStorage).keys());

        /**
         * @type {any}
         */
        let offer = await E(chainStorage).getBody(`mockChainStorageRoot.futarchy.offers.0`);

        console.log('GOING TO CANCEL OFFER', offer);

        t.true(offer.available);
        t.false(await (seatA?.hasExited()));

        await cancelOffer(t, instance, offer, 'a');

        offer = await E(chainStorage).getBody(`mockChainStorageRoot.futarchy.offers.0`);

        t.false(offer.available);
        t.true(await (seatA?.hasExited()));
    } catch (e) {
        console.error(e);
        ex = e;
    }

    t.true(ex == null);
});