import { test as anyTest } from '../prepare-test-env-ava.js';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';

import { UNIT6, makeTestContext, createInstance, joinFutarchyAndMakeOffers } from '../boiler-plate.js';

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

/**
 * @import {ERef} from '@endo/far';
 * @import {ExecutionContext} from 'ava';
 * @import {Instance} from '@agoric/zoe/src/zoeService/utils.js';
 * @import {Purse} from '@agoric/ertp/src/types.js';
 */

/** @import {RemoteOffer} from '../boiler-plate.js'*/

test.before(async t => (t.context = await makeTestContext(t)));

test('The same user makes two asks', async t => {
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
            resolved: false,
            taker: false,
            timestamp: 0n,
            type: 'ask',
            secret: undefined
        }, {
            address: 'a',
            amount: 1000000n,
            total: 101000000n,
            condition: 1,
            id: 1n,
            price: 101000000n,
            resolved: false,
            taker: false,
            timestamp: 0n,
            type: 'ask',
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
            user: "a"
        },
        {
            proposal: {
                give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
                want: { CashYes: AmountMath.make(brands.CashYes, BigInt(101n * UNIT6)) }
            },
            args: {
                address: "a",
                secret: "a",
                taker: false
            },
            user: "a"
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
            t.true(actual[key] === expectedResponses[i][key]);    
        })
    }

    for (let i = 0; i < 2; i++) {
        /**
         * @type {any}
         */
        const actual = await E(chainStorage).getBody(`mockChainStorageRoot.futarchy.offers.${i}`);

        t.true(actual.available);
    }

    t.true(ex == null);
});
