import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { makeStableFaucet } from './mintStable.js';

import { createInstance } from './boiler-plate.js';

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve(`../src/futarchy.contract.js`);

/** @typedef {typeof import('../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * @typedef {{
*   zoe: ZoeService,
*   bundle: any,
*   bundleCache: BundleCache,
*   feeMintAccess: FeeMintAccess
* }} TestContext
*/
const test = /** @type {import('ava').TestFn<TestContext>}} */ (anyTest);

/**
 * @import {ERef} from '@endo/far';
 * @import {ExecutionContext} from 'ava';
 * @import {Instance} from '@agoric/zoe/src/zoeService/utils.js';
 * @import {Purse} from '@agoric/ertp/src/types.js';
 */

const UNIT6 = 1_000_000n;
const CENT = UNIT6 / 100n;

const makeTestContext = async _t => {
  const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));
  const bundle = await bundleCache.load(contractPath, 'assetContract');

  return { zoe, bundle, bundleCache, feeMintAccess };
};

test.before(async t => (t.context = await makeTestContext(t)));

test('Install the contract', async t => {
  const { zoe, bundle } = t.context;

  const installation = await E(zoe).install(bundle);
  t.log(installation);
  t.is(typeof installation, 'object');
});


/**
 * 
 * 
 * Alice trades by paying the price from the contract's terms.
 *
 * @param {ExecutionContext} t
 * @param {ZoeService} zoe
 * @param {ERef<Instance<AssetContractFn>>} instance
 * @param {Purse<'nat'>} purse
 */
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

  const seat = E(zoe).offer(toTrade, proposal, { Price: pmt });

  const xtract = async (tag) => {
    const payout = await E(seat).getPayout(tag);
    return await E(issuers[tag]).getAmountOf(payout);
  }

  return {
    "CashNo": await xtract("CashNo"),
    "CashYes": await xtract("CashYes"),
    "SharesNo": await xtract("SharesNo"),
    "SharesYes": await xtract("SharesYes")
  }
};

const joinFutarchyWrongWant = async (t, zoe, instance, purse) => {
  const publicFacet = E(zoe).getPublicFacet(instance);
  const terms = await E(zoe).getTerms(instance);
  const { issuers, brands, joinFutarchyFee } = terms;

  const proposal = {
    give: { Price: joinFutarchyFee },
    want: {
      CashNo: AmountMath.make(brands.CashNo, 101n * UNIT6)
    }
  };

  const pmt = await E(purse).withdraw(joinFutarchyFee);

  const toTrade = await E(publicFacet).joinFutarchy();

  const seat = E(zoe).offer(toTrade, proposal, { Price: pmt });

  return await E(seat).getPayouts();
};

test('Ask for something in the join want', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  let exception;

  try {
    await joinFutarchyWrongWant(t, zoe, instance, await faucet(1000n * UNIT6));

    t.fail('Should have failed')
  } catch (e) {
    exception = e;
  }

  t.false(exception == null);
});

test('Check all assets are transfered', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const payouts = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

  const terms = await E(zoe).getTerms(instance);
  const { brands } = terms;

  const publicFacet = E(zoe).getPublicFacet(instance);

  const { CASH, SHARES, UNIT } = await E(publicFacet).getLimits();

  t.deepEqual(payouts.CashNo, AmountMath.make(brands.CashNo, BigInt(CASH * UNIT)));
  t.deepEqual(payouts.CashYes, AmountMath.make(brands.CashYes, BigInt(CASH * UNIT)));
  t.deepEqual(payouts.SharesNo, AmountMath.make(brands.SharesNo, BigInt(SHARES * UNIT)));
  t.deepEqual(payouts.SharesYes, AmountMath.make(brands.SharesYes, BigInt(SHARES * UNIT)));
});