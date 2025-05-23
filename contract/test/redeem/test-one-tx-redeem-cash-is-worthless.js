import { test as anyTest } from '../prepare-test-env-ava.js';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';
import { TimeMath } from '@agoric/time';

import { UNIT6, makeTestContext, createInstance, joinFutarchyAndMakeOffers, redeemAll, finalizeUserSeats } from '../boiler-plate.js';

/** @typedef {typeof import('../../src/futarchy.contract.js').start} AssetContractFn */
/** @typedef {Awaited<ReturnType<import('@endo/bundle-source/cache.js').makeNodeBundleCache>>} BundleCache */

/**
 * 
 * @import {RemoteOffer, User} from '../boiler-plate.js'
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

test('Redeem when no txs happened', async t => {
    const { zoe } = t.context;

    const { instance, chainStorage, timerService } = await createInstance(t, 1n);

    const { brands, issuers } = await E(zoe).getTerms(instance);

    let ex;

    const expectations = {}

    /**
     * @type{UserSeat | undefined}
     */
    let seatA;

    /**
     * @type{UserSeat | undefined}
     */
    let seatB;

    /**
     * @type{RemoteOffer[]}
     */
    const remoteOffers = [
        {
            proposal: {
                give: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) },
                want: { CashYes: AmountMath.make(brands.CashYes, BigInt(200n * UNIT6)) }
            },
            args: {
                address: "a",
                secret: "a",
                taker: false
            },
            user: "a",
            seatHook: (seat) => {
                seatA = seat;
            }
        },
        {
            proposal: {
                give: { CashYes: AmountMath.make(brands.CashYes, BigInt(200n * UNIT6)) },
                want: { SharesYes: AmountMath.make(brands.SharesYes, BigInt(1n * UNIT6)) }
            },
            args: {
                address: "b",
                secret: "b",
                taker: false
            },
            user: "b",
            seatHook: (seat) => {
                seatB = seat;
            }
        }
    ];

    let users;

    /**
     * @type {UserSeat | undefined}
     */
    let redeemSeatA;
    let redeemSeatB;

    try {
        const {
            results,
            users
        } = await joinFutarchyAndMakeOffers(t, instance, remoteOffers);

        console.log('ADVANCING');

        await timerService.advanceBy(TimeMath.absValue(300n));

        await new Promise(resolve => setTimeout(resolve, 500)); //Gives time to the outcome to be generated

        for (let name of Object.keys(users)) {
            finalizeUserSeats(t, instance, users[name]);
        }
        
        t.true(await E(seatA)?.hasExited());
        t.true(await E(seatB)?.hasExited());

        console.log('KEYS', await E(chainStorage).keys());

        /**
         * @type {User}
         */
        const userA = users?.a;

        /**
         * @type {User}
         */
        const userB = users?.b;

        /**
         * @type {any}
         */
        const outcome = chainStorage.getBody('mockChainStorageRoot.futarchy.outcome');

        t.true(outcome != null);
        t.true(outcome.result);

        console.log('OUTCOME', outcome);

        redeemSeatA = await redeemAll(t, instance, userA.purses, outcome.result ? 1 : 0);
        redeemSeatB = await redeemAll(t, instance, userB.purses, outcome.result ? 1 : 0);
    } catch (e) {
        console.error(e);
        ex = e;
    }

    const userAredeemedPayout = await issuers.Price.getAmountOf(await redeemSeatA?.getPayout('Price'));
    const userBredeemedPayout = await issuers.Price.getAmountOf(await redeemSeatB?.getPayout('Price'));

    t.deepEqual(userAredeemedPayout.value, 99n * UNIT6);
    t.deepEqual(userBredeemedPayout.value, 101n * UNIT6);

    t.true(ex == null);
});
