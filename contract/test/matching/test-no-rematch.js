import { test as anyTest } from '../prepare-test-env-ava.js';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';

import { UNIT6, makeTestContext, createInstance, joinFutarchyAndMakeOffers } from '../boiler-plate.js';

/** @typedef {typeof import('../../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * 
 * @import {RemoteOffer} from '../boiler-plate.js'
 * @import {UserSeat, FeeMintAccess, ZoeService} from '@agoric/zoe'
 * 
 * @typedef {{
*   zoe: ZoeService,
*   bundle: any,
*   bundleCache: BundleCache,
*   feeMintAccess: FeeMintAccess
* }} TestContext
*/
const test = /** @type {import('ava').TestFn<TestContext>}} */ (anyTest);

test.before(async t => (t.context = await makeTestContext(t)));

test('Different users make matching ask and bid', async t => {
    const { zoe } = t.context;

    const { instance, chainStorage }  = await createInstance(t);

    const { brands, issuers } = await E(zoe).getTerms(instance);

    let ex;

    /**
     * @type{UserSeat | undefined}
     */
    let aSeat;
    /**
     * @type{UserSeat | undefined}
     */
    let bSeat;
    /**
     * @type{UserSeat | undefined}
     */
    let cSeat;

    const expectedResponses = [
        {
            address: 'a',
            amount: 1000000n,
            total: 100000000n,
            condition: 1,
            id: 0n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            type: 'ask',
            secret: undefined
        }, {
            address: 'b',
            amount: 1000000n,
            total: 100000000n,
            condition: 1,
            id: 1n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            type: 'bid',
            secret: undefined
        }, {
            address: 'b',
            amount: 1000000n,
            total: 100000000n,
            condition: 1,
            id: 1n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            type: 'bid',
            secret: undefined
        }
    ];

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
                aSeat = seat;
                const hasExited = await E(aSeat).hasExited();
                t.false(hasExited);
            }
        },
        {
            proposal: {
                give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) },
                want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
            },
            args: {
                address: "b",
                secret: "b",
                taker: false
            },
            user: "b",
            seatHook: async (seat) => {
                bSeat = seat;
            }
        },
        {
            proposal: {
                give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) },
                want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
            },
            args: {
                address: "b",
                secret: "b",
                taker: false
            },
            user: "b",
            seatHook: async (seat) => {
                cSeat = seat;
            }
        },
    ];

    try {
        await joinFutarchyAndMakeOffers(t, instance, remoteOffers);

        console.log('KEYS', await E(chainStorage).keys());
    } catch (e) {
        console.error(e);
        ex = e;
    }

    const keys = await E(chainStorage).keys();

    for (let key of [
        'mockChainStorageRoot.futarchy.history.0',
        'mockChainStorageRoot.futarchy.offers.0',
        'mockChainStorageRoot.futarchy.history.1',
        'mockChainStorageRoot.futarchy.offers.1'
    ]) {
        t.true(keys.includes(key));
    }

    for (let i = 0; i < 2; i++) {
        /**
         * @type {any}
         */
        const actual = await E(chainStorage).getBody(`mockChainStorageRoot.futarchy.history.${i}`);

        Object.keys(expectedResponses[i]).forEach( key => {
            t.deepEqual(
                actual[key], expectedResponses[i][key],
                `actual[${key}] not equal to expectedResponses[${i}][${key}]: ${actual[key]} != ${expectedResponses[i][key]}`
            );    
        })
    }

    for (let i = 0; i < 2; i++) {
        /**
         * @type {any}
         */
        const actual = await E(chainStorage).getBody(`mockChainStorageRoot.futarchy.offers.${i}`);

        t.false(actual.available);
    }

    t.true(ex == null);

    //Verify all seats exit status
    t.true(await E(aSeat)?.hasExited());
    t.true(await E(bSeat)?.hasExited());
    t.false(await E(cSeat)?.hasExited()); //Proves the repeated bid was not rematched against the original ask

    //Verify all parties received what was stated in the offer
    const offer = expectedResponses[0];
    const cashToOfferer = await E(issuers['CashYes']).getAmountOf(await E(aSeat)?.getPayout('CashYes'));
    const sharesToMatcher = await E(issuers['SharesYes']).getAmountOf(await E(bSeat)?.getPayout('SharesYes'));

    t.deepEqual(
        cashToOfferer.value, offer.total,
        `The offerer received ${cashToOfferer.value}, while expecting ${offer.total}`
    );

    t.deepEqual(
        sharesToMatcher.value, offer.amount,
        `The offerer received ${sharesToMatcher.value}, while expecting ${offer.amount}`
    );
});

//NEXT tests:

//match ask bid
//match best bid among two
//match best bid among two, reverse order
//match best bid among many, ordered
//match best bid among many, scrambled

//check the median after 1,2,3,4,5,6,7,8 done deals
