import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { makeStableFaucet } from './mintStable.js';

import { startContract } from './start-contract-for-test.js';
import { createInstance } from './boiler-plate.js';

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

test('Install the contract', async t => {
  const { zoe, bundle } = t.context;

  const installation = await E(zoe).install(bundle);
  t.log(installation);
  t.is(typeof installation, 'object');
});

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

test('Valid Bid', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) },
    want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
  };

  let ex; 
  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'valid bid');
  } catch (e) {
    console.error(e);
    ex = e;
  }

  t.true(ex == null);
});

test('Valid Ask', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
    want: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)) }
  };

  let ex; 
  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'valid bid');
  } catch (e) {
    console.error(e);
    ex = e;
  }

  t.true(ex == null);
});

test('Check Invalid Offer with multiple gives', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });
  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: {
      CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)),
      CashNo: AmountMath.make(brands.CashNo, BigInt(100n * UNIT6))
    },
    want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: give: {"CashNo":{"brand":"[Alleged: CashNo brand]","value":"[100000000n]"},"CashYes":{"brand":"[Alleged: CashYes brand]","value":"[100000000n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]'

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'Multiple gives');
  } catch (e) {
    ex = e;
    console.log('MESSAGE', e.message);
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid Offer with multiple wants', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: {
      CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6))
    },
    want: {
      SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)),
      SharesNo: AmountMath.make(brands.SharesNo, BigInt(1n * UNIT6))
    }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: want: {"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"},"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'Multiple wants');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid Offer 0 cash', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: { CashYes: AmountMath.make(brands.CashYes, BigInt(0n * UNIT6)) },
    want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: give: {"CashYes":{"brand":"[Alleged: CashYes brand]","value":"[0n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, '0 cash');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid Offer 0 shares', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)), },
    want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(0n * UNIT6)) }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: want: {"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[0n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, '0 shares');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid: mismatch', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: { CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)), },
    want: { SharesNo: AmountMath.make(brands.SharesNo, BigInt(1n * UNIT6)) }
  };

  let ex;
  let message = 'Mismatch: a request of SharesNo should have a matching offer of CashNo';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'mismatch');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid: double bid', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: {
      CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)),
      CashNo: AmountMath.make(brands.CashNo, BigInt(100n * UNIT6))
    },
    want: {
      SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)),
      SharesNo: AmountMath.make(brands.SharesNo, BigInt(1n * UNIT6))
    }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: want: {"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"},"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'double bid');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});

test('Check Invalid: bid and ask', async t => {
  const { zoe, bundle, bundleCache, feeMintAccess } = t.context;
  const { instance, chainStorage } = await createInstance(t);

  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

  const { brands, issuers } = await E(zoe).getTerms(instance);

  const proposal = {
    give: {
      CashYes: AmountMath.make(brands.CashYes, BigInt(100n * UNIT6)),
      SharesNo: AmountMath.make(brands.SharesNo, BigInt(1n * UNIT6))
    },
    want: {
      SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)),
      CashNo: AmountMath.make(brands.CashNo, BigInt(100n * UNIT6))
    }
  };

  let ex;
  let message = '"Make Offer (bid| ask)" proposal: want: {"CashNo":{"brand":"[Alleged: CashNo brand]","value":"[100000000n]"},"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}} - Must match one of [{"CashYes":"[match:gt]"},{"CashNo":"[match:gt]"},{"SharesYes":{"brand":"[Alleged: SharesYes brand]","value":"[1000000n]"}},{"SharesNo":{"brand":"[Alleged: SharesNo brand]","value":"[1000000n]"}}]';

  try {
    const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));

    const purses = await proposalToPurses(proposal, issuers, userSeat);

    await makeProposal(t, zoe, instance, purses, proposal, 'bid and ask');
  } catch (e) {
    ex = e;
  }

  t.true(ex != null);
  t.deepEqual(ex.message, message);
});