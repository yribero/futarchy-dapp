import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
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

const UNIT6 = 1_000_000n;
const CENT = UNIT6 / 100n;

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

  const userSeat = await E(zoe).offer(
    toTrade,
    proposal,
    { Price: pmt },
    {
      arg0: "hello"
    }
  );

  return await userSeat.getPayout("CashYes");
}

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
 * @param {import ("@agoric/zoe").ZoeService} zoe
 * @param {ERef<Instance<AssetContractFn>>} instance
 * @param {Purse<'nat'>} purse
 */
const makeOffer = async (t, zoe, instance, purse, payment) => {
  const publicFacet = await E(zoe).getPublicFacet(instance);
  const terms = await E(zoe).getTerms(instance);

  const cashYesPurse = await E(terms.issuers.CashYes).makeEmptyPurse();
  cashYesPurse.deposit(payment);

  const { issuers, brands, joinFutarchyFee } = terms;

  const { CASH, SHARES, UNIT } = await E(publicFacet).getLimits();

  const proposal = {
    give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT)) },
    want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT)) }
  };

  const toTrade = await E(publicFacet).makeOffer({many: 0});

  const fee = cashYesPurse.withdraw(AmountMath.make(brands.CashYes, 100n * UNIT));

  const seat = E(zoe).offer(toTrade, proposal, { CashYes: fee });
};

test('Check No Exception on First Offer', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance } = await startContract({ zoe, bundle });

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  let ex; 
  try {
    const payment = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    console.log('MANAGED TO JOIN FUTARCHY');

    await makeOffer(t, zoe, instance, await faucet(1000n * UNIT6), payment);
  } catch (e) {
    console.error(e);
    ex = e;
  }

  t.true(ex == null);
});