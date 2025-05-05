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
 * @import {FeeMintAccess, ZoeService} from '@agoric/zoe'
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

    const expectations = [
        { '0': 0n, '1': 90000000n },
        { '0': 0n, '1': 90500000n },
        { '0': 0n, '1': 91000000n },
        { '0': 0n, '1': 91500000n },
        { '0': 0n, '1': 92000000n },
        { '0': 0n, '1': 92500000n },
        { '0': 0n, '1': 93000000n },
        { '0': 0n, '1': 94000000n },
        { '0': 0n, '1': 95000000n },
        { '0': 0n, '1': 96000000n }
    ]

    /**
     * @type{RemoteOffer[]}
     */
    const remoteOffers = [];

    for (let i = 0; i < 10; i++) {
        remoteOffers.push({
            proposal: {
                give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
                want: { CashYes: AmountMath.make(brands.CashYes, BigInt(BigInt(i + 90) * UNIT6)) }
            },
            args: {
                address: "a",
                secret: "a",
                taker: false
            },
            user: "a",
        }, {
            proposal: {
                give: { CashYes: AmountMath.make(brands.CashYes, BigInt(BigInt(i + 90) * UNIT6)) },
                want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
            },
            args: {
                address: "b",
                secret: "b",
                taker: false
            },
            user: "b",
            async afterOfferHook(purses, proposal, args) {
                const actual = await E(chainStorage).getBody('mockChainStorageRoot.futarchy.medians');


                t.deepEqual(
                    actual, expectations[i],
                    `The median after ${i + i} done deals was expected to be ${expectations[i]}, but it was ${actual}`
                );
            }
        });
    }

    try {
        await joinFutarchyAndMakeOffers(t, instance, remoteOffers);
    } catch (e) {
        console.error(e);
        ex = e;
    }

    t.true(ex == null);
});

