import { test as anyTest } from '../prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath } from '@agoric/ertp';

import { makeStableFaucet } from '../mintStable.js';
import { createInstance } from '../boiler-plate.js';

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve(`../../src/futarchy.contract.js`);

/** @typedef {typeof import('../../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * 
 * @typedef {{
*   zoe: ZoeService,
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
 * @import {ZoeService} from '@agoric/zoe';
 */

const UNIT6 = 1_000_000n;

const makeTestContext = async _t => {
    const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

    const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));
    const bundle = await bundleCache.load(contractPath, 'assetContract');

    return { zoe, bundle, bundleCache, feeMintAccess };
};

test.before(async t => (t.context = await makeTestContext(t)));

const joinFutarchy = async (t, zoe, instance, purse) => {
    const publicFacet = E(zoe).getPublicFacet(instance);
    const terms = await E(zoe).getTerms(instance);
    const { issuers, brands, joinFutarchyFee } = terms;

    const proposal = {
        give: { Price: joinFutarchyFee },
        want: {}
    };

    const pmt = await E(purse).withdraw(joinFutarchyFee);

    const toTrade = await E(publicFacet).joinFutarchy();

    const userSeat = await E(zoe).offer(toTrade, proposal, { Price: pmt });

    return await userSeat;
}

const makeProposal = async (t, zoe, instance, purses, proposal, msg) => {
    const publicFacet = await E(zoe).getPublicFacet(instance);

    const toTrade = await E(publicFacet).makeOffer();

    const feePart = {};

    for (let purse of purses) {
        const assetName = purse.getAllegedBrand().getAllegedName();

        const fee = purse.withdraw(AmountMath.make(purse.getAllegedBrand(), proposal.give[assetName].value));

        feePart[assetName] = fee;
    }

    const seat = await E(zoe).offer(
        toTrade,
        proposal,
        feePart,
        {
            arg0: msg
        }
    );

    return await E(seat).getOfferResult();
};

const proposalToPurses = async (proposal, issuers, userSeat) => {
    const purses = [];

    for (let assetName of Object.keys(proposal.give)) {
        const purse = await E(issuers[assetName]).makeEmptyPurse();

        const payment = await E(userSeat).getPayout(assetName);

        purse.deposit(payment);

        purses.push(purse);
    }

    return purses;
}

test('History is written', async t => {
    const { zoe, bundleCache, feeMintAccess } = t.context;

    const { instance, chainStorage } = await createInstance(t);

    const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

    const { brands, issuers } = await E(zoe).getTerms(instance);

    const proposal = {
        give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
        want: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) }
    };

    let ex;

    const expected = {
        address: undefined,
        amount: 1000000n,
        total: 100000000n,
        condition: 1,
        id: 0n,
        price: 100000000n,
        available: undefined,
        taker: undefined,
        timestamp: 0n,
        type: 'ask'
    };

    /**
     * @type{any}
     */
    let actual;

    try {
        const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

        const purses = await proposalToPurses(proposal, issuers, userSeat);

        await makeProposal(t, zoe, instance, purses, proposal, 'History is written');

        //To retrieve published keys: await E(chainStorage).keys();

        actual = await E(chainStorage).getBody('mockChainStorageRoot.futarchy.history.0');
    } catch (e) {
        console.error(e);
        ex = e;
    }

    t.true(actual.amount === expected.amount);
    t.true(actual.condition === expected.condition);
    t.true(actual.id === expected.id);
    t.true(actual.price === expected.price);
    t.true(actual.resolved === expected.resolved);
    t.true(actual.type === expected.type);
    t.true(actual.total === expected.total);

    t.true(ex == null);
});