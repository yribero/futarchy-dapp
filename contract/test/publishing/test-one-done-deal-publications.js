import { test as anyTest } from '../prepare-test-env-ava.js';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';

import { UNIT6, makeTestContext, createInstance, joinFutarchyAndMakeOffers, assertEqualObjects } from '../boiler-plate.js';

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

test('Done deal publications', async t => {
    const { zoe } = t.context;

    const { instance, chainStorage } = await createInstance(t);

    const { brands } = await E(zoe).getTerms(instance);

    let ex;

    const expectations = {
        "mockChainStorageRoot.futarchy.history.0": {
            address: 'a',
            amount: 1000000n,
            condition: 1,
            id: 0n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            total: 100000000n,
            type: 'ask'
        },
        "mockChainStorageRoot.futarchy.offers.0": {
            address: 'a',
            amount: 1000000n,
            available: false,
            condition: 1,
            id: 0n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            total: 100000000n,
            type: 'ask'
        },
        "mockChainStorageRoot.futarchy.history.1": {
            address: 'b',
            amount: 1000000n,
            condition: 1,
            id: 1n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            total: 100000000n,
            type: 'bid'
        },
        "mockChainStorageRoot.futarchy.offers.1": {
            address: 'b',
            amount: 1000000n,
            available: false,
            condition: 1,
            id: 1n,
            price: 100000000n,
            taker: false,
            timestamp: 0n,
            total: 100000000n,
            type: 'bid'
        },
        "mockChainStorageRoot.futarchy.doneDeals.0": {
            amount: 1000000n,
            condition: 1,
            from: 'a',
            id: 0n,
            price: 100000000n,
            timestamp: 0n,
            to: 'b',
            total: 100000000n
        },
        "mockChainStorageRoot.futarchy.medians": {
            '0': 0n,
            '1': 100000000n
        }
    }

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
            user: "a"
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
            user: "b"
        }
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
        'mockChainStorageRoot.futarchy.offers.1',
        'mockChainStorageRoot.futarchy.doneDeals.0',
        'mockChainStorageRoot.futarchy.medians'
    ]) {
        t.true(keys.includes(key));

        const actual = await E(chainStorage).getBody(key);

        assertEqualObjects(t, actual, expectations[key]);
    }

    t.true(ex == null);
});

//NEXT tests:

//check the publications of median after 1,2,3,4,5,6,7,8 done deals
