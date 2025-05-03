import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { makeStableFaucet } from './mintStable.js';

import { startContract } from './start-contract-for-test.js';

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve(`../src/futarchy.contract.js`);

/** @typedef {typeof import('../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * @typedef {{
*   zoe: import("@agoric/zoe/src/zoeService/types.js").ZoeService,
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
 * Alice trades by paying the price from the contract's terms.
 *
 * @param {ExecutionContext} t
 * @param {ERef<Instance<AssetContractFn>>} instance
 * @param {Purse<'nat'>} purse
 * @param {string[]} choices
*/
const alice = async (t, zoe, instance, purse, choices = ['map', 'scroll']) => {
  console.log("alice");

  const publicFacet = E(zoe).getPublicFacet(instance);

  console.log("public facet");
  const terms = await E(zoe).getTerms(instance);

  console.log("TERMS", terms);
  const { issuers, brands, joinFutarchyFee } = terms;

  const proposal = {
    give: { Price: joinFutarchyFee },
    want: {}
  };

  const pmt = await E(purse).withdraw(joinFutarchyFee);
  console.log(joinFutarchyFee)
  console.log('Alice gives', proposal.give);
  // #endregion makeProposal

  const toTrade = await E(publicFacet).joinFutarchy();

  console.log("To Trade", toTrade);

  const seat = E(zoe).offer(toTrade, proposal, { Price: pmt });

  const all = await E(seat).getPayouts();

  console.log("All payouts", all);

  const cashNo = await E(seat).getPayout('CashNo');
  const price = await E(seat).getPayout('Price');


  const finalAllocation = await E(seat).getFinalAllocation();
  console.log("Final Allocation", finalAllocation);

  const actualCashNo = await E(issuers.CashNo).getAmountOf(cashNo);
  const actualPrice = await E(issuers.Price).getAmountOf(price);
  console.log('Alice payout brand', actualCashNo.brand);
  console.log('Alice payout value', actualCashNo.value);
  console.log('Price payout brand', actualPrice.brand);
  console.log('Price payout value', actualPrice.value);
  t.log('Alice payout brand', actualCashNo.brand);
  t.log('Alice payout value', actualCashNo.value);
  t.deepEqual(actualCashNo, AmountMath.make(brands.CashNo, 10000000000n));
};

test('Trade in IST rather than play money', async t => {
  console.log('AAAAAAA');

  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

  console.log('BBBBBBBB');
  const { instance } = await startContract({ zoe, bundle });

  console.log('Contract started')

  const terms2 = await E(zoe).getTerms(instance);

  console.log("TEERMS");
  console.log(terms2);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });
  await alice(t, zoe, instance, await faucet(1000n * UNIT6));
});