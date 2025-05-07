import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath } from '@agoric/ertp';
import { makeMockChainStorageRoot } from '@agoric/internal/src/storage-test-utils.js';
import { makeMarshal } from '@endo/marshal';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';

import { makeStableFaucet } from './mintStable.js';

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve(`../src/futarchy.contract.js`);

/**
 * 
 * @typedef {{
 *     seat: import ("@agoric/zoe").UserSeat
 *     purses: any,
 *     seats: UserSeat[]
 * }} User
 * 
 * @typedef {function(UserSeat): void} SeatHook
 * @typedef {function(Purse[], {give, want}, any): void} OfferHook
 *  
 * @typedef {{
 *    proposal: {
 *      give: any;
 *      want: any;
 *    }
 *    args: any;
 *    user: string,
 *    seatHook?: SeatHook,
 *    beforeOfferHook?: OfferHook,
 *    afterOfferHook?: OfferHook
 * }} RemoteOffer
 *
 * @import {ERef} from '@endo/far';
 * @import {ExecutionContext} from 'ava';
 * @import {Instance} from '@agoric/zoe/src/zoeService/utils.js';
 * @import {Purse} from '@agoric/ertp/src/types.js';
 * @import {UserSeat} from '@agoric/zoe';
 * @import {TimerService} from '@agoric/swingset-vat/tools/manual-timer.js';
 */

const UNIT6 = 1_000_000n;

const makeTestContext = async _t => {
    const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

    const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));
    const bundle = await bundleCache.load(contractPath, 'assetContract');

    return { zoe, bundle, bundleCache, feeMintAccess };
};

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

const makeProposal = async (t, zoe, instance, purses, proposal, args = {}) => {
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
        args
    );

    await E(seat).getOfferResult();

    return seat;
};

const createInstance = async (t, duration = 300n) => {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const installation = E(zoe).install(bundle);
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const joinFutarchyFee = AmountMath.make(feeBrand, 100n * UNIT6);
    const chainStorage = makeMockChainStorageRoot();

    const board = Far("board", {
        getPublishingMarshaller() {
            return makeMarshal();
        }
    });

    /**
     * @type {TimerService}
     */
    const timerService = buildManualTimer(console.log, 0n);

    const { instance } = await E(zoe).startInstance(
        installation,
        { Price: feeIssuer },
        { joinFutarchyFee, duration },
        {
            storageNode: chainStorage.makeChildNode('futarchy'),
            board,
            timerService
        }
    );

    return { instance, chainStorage, timerService };
}

/**
 * 
 * @param {*} issuers 
 * @param {*} seat 
 * 
 * @returns {Promise<User>}
 */
const makeUser = async (issuers, seat) => {
    const purses = {};

    for (let asset of ['CashNo', 'CashYes', 'SharesNo', 'SharesYes', 'Price']) {
        /**
         * @type {Purse}
         */
        const purse = await E(issuers[asset]).makeEmptyPurse();

        const payment = await E(seat).getPayout(asset);

        purse.deposit(payment);

        purses[asset] = purse;
    }

    return {
        seat,
        purses,
        seats: []
    }
}


/**
 * 
 * @param {*} t 
 * @param { RemoteOffer[] } remoteOffers 
 */
const joinFutarchyAndMakeOffers = async (t, instance, remoteOffers) => {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

    const users = {};

    const { brands, issuers } = await E(zoe).getTerms(instance);

    const results = [];

    for (let remoteOffer of remoteOffers) {
        if (users[remoteOffer.user] == null) {
            const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));
            
            users[remoteOffer.user] = await makeUser(issuers, userSeat);
        }

        /**
         * @type {Purse[]}
         */
        const purses = [];

        for (let assetName of Object.keys(remoteOffer.proposal.give)) {
            purses.push(users[remoteOffer.user].purses[assetName]);
        }

        /**
         * HOOKS ARE NOT ASYNC! THEY WILL NOT BLOCK THE TEST IF THEY HANG, BUT THE CODE INSIDE WILL NOT BE EXECUTED ON TIME
         * IF THEY ARE DECLARED ASYNC AND THEY WAIT FOR A PROMISE THAT WILL NOT RESOLVE
         * TODO: MAKE HOOKS HANG FOR FEW SECONDS; THEN MAKE THE TEST FAIL
         */
        if (remoteOffer.beforeOfferHook != null) {
            remoteOffer.beforeOfferHook(purses, remoteOffer.proposal, remoteOffer.args)
        }

        const seat = await makeProposal(t, zoe, instance, purses, remoteOffer.proposal, remoteOffer.args);

        users[remoteOffer.user].seats.push(seat);

        results.push(seat);

        if (remoteOffer.afterOfferHook != null) {
            remoteOffer.afterOfferHook(purses, remoteOffer.proposal, remoteOffer.args)
        }

        if (remoteOffer.seatHook != null) {
            remoteOffer.seatHook(seat);
        }
    }

    return {
        results,
        users
    };
}

/**
 * 
 * @param {*} t 
 * @param {any} actual 
 * @param {any} expected 
 */
const assertEqualObjects = (t, actual, expected) => {
    const firstKeys = Object.keys(actual);
    const secondKeys = Object.keys(expected);

    for (let key of firstKeys) {
        t.deepEqual(
            actual[key], expected[key],
            `Was expecting actual[${key}] === expected[${key}], but ${actual[key]} != ${expected[key]}`
        );
    }

    for (let key of secondKeys) {
        t.deepEqual(
            actual[key], expected[key],
            `Was expecting actual[${key}] === expected[${key}], but ${actual[key]} != ${expected[key]}`
        );
    }
}

/**
 * 
 * @param {*} t 
 * @param {*} instance 
 * @param {{ id: bigint }} offer
 * @param {string} secret 
 * @returns 
 */
const cancelOffer = async (t, instance, offer, secret) =>  {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const publicFacet = await E(zoe).getPublicFacet(instance);

    const toTrade = await E(publicFacet).cancelOffer();

    const proposal = {
        give: {},
        want: {}
    };

    const args = {
        id: offer.id,
        secret: secret
    }

    console.log('OFFER', offer);

    console.log('TO-TRADE', toTrade);
    console.log('PROPOSAL', proposal);
    console.log('ARGS', args);

    const seat = await E(zoe).offer(
        toTrade,
        proposal,
        {},
        args
    );

    await E(seat).getOfferResult();

    return seat;
}

/**
 * 
 * @param {*} t 
 * @param {*} instance 
 * @param {*} purses 
 * @param {number} condition
 * @returns 
 */
const redeemAll = async (t, instance, purses, condition) =>  {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const publicFacet = await E(zoe).getPublicFacet(instance);

    const toTrade = await E(publicFacet).redeem();

    const feePart = {};

    const proposal = {
        give: {},
        want: {}
    }

    let keys;

    if (condition === 0) {
        keys = ['CashNo', 'SharesNo'];
    } else {
        keys = ['CashYes', 'SharesYes'];
    }

    for (let key of keys) {
        const purse = purses[key];

        const assetName = purse.getAllegedBrand().getAllegedName();

        proposal.give[assetName] = purse.getCurrentAmount();

        const fee = purse.withdraw(purse.getCurrentAmount());

        feePart[assetName] = fee;
    }

    console.log('PROPOSAL', proposal);
    console.log('FEES', feePart);

    const seat = await E(zoe).offer(
        toTrade,
        proposal,
        feePart,
        {}
    );

    await E(seat).getOfferResult();

    return seat;
}

/**
 * 
 * @param {User} user 
 */
const finalizeUserSeats = async (t, instance, user) => {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const { brands, issuers } = await E(zoe).getTerms(instance);

    for (let seat of user.seats) {
        try {
            const payouts = await seat.getPayouts();

            for (let key of Object.keys(payouts)) {
                const payment = await seat.getPayout(key);

                const purse = user.purses[key];

                await purse.deposit(payment);
            }
        } catch (e) {
            //IGNORE
            console.warn(`While transfering payouts to user ${user}`, e.message)
        }
    }
}

/**
 * @exports {RemoteOffer, SeatHook, OfferHook, User}
 */
export { UNIT6, makeTestContext, joinFutarchy, makeProposal, createInstance, cancelOffer,
    makeUser, joinFutarchyAndMakeOffers, assertEqualObjects, redeemAll, finalizeUserSeats };