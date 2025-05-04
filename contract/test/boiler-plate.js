import { createRequire } from 'module';
import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { makeMockChainStorageRoot } from '@agoric/internal/src/storage-test-utils.js';

import { makeStableFaucet } from './mintStable.js';

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve(`../src/futarchy.contract.js`);

/**
 * 
 * @typedef {{
 *     seat: import ("@agoric/zoe").UserSeat
 *     purses: any
 * }} User
 * 
 * @typedef {function(UserSeat): any} SeatHook
 *  
 * @typedef {{
 *    proposal: {
 *      give: any;
 *      want: any;
 *    }
 *    args: any;
 *    user: string,
 *    hook?: SeatHook
 * }} RemoteOffer
 *
 * @import {ERef} from '@endo/far';
 * @import {ExecutionContext} from 'ava';
 * @import {Instance} from '@agoric/zoe/src/zoeService/utils.js';
 * @import {Purse} from '@agoric/ertp/src/types.js';
 * @import {UserSeat} from '@agoric/zoe';
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

const createInstance = async (t) => {
    const { zoe, bundle, bundleCache, feeMintAccess } = t.context;

    const installation = E(zoe).install(bundle);
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const joinFutarchyFee = AmountMath.make(feeBrand, 100n * UNIT6);
    const chainStorage = makeMockChainStorageRoot();

    const { instance } = await E(zoe).startInstance(
        installation,
        { Price: feeIssuer },
        { joinFutarchyFee },
        {
            storageNode: chainStorage.makeChildNode('futarchy'),
            board: chainStorage.makeChildNode('boardAux'),
            isTest: true
        }
    );

    return { instance, chainStorage };
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

    for (let asset of ['CashNo', 'CashYes', 'SharesNo', 'SharesYes']) {
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
        purses
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

    for (let remoteOffer of remoteOffers) {
        if (users[remoteOffer.user] == null) {
            const userSeat = await joinFutarchy(t, zoe, instance, await faucet(1000n * UNIT6));
            
            users[remoteOffer.user] = await makeUser(issuers, userSeat);
        }

        const purses = [];

        for (let assetName of Object.keys(remoteOffer.proposal.give)) {
            purses.push(users[remoteOffer.user].purses[assetName]);
        }

        const result = await makeProposal(t, zoe, instance, purses, remoteOffer.proposal, remoteOffer.args);

        if (remoteOffer.hook != null) {
            remoteOffer.hook(result);
        }
    }
}

/**
 * @exports {RemoteOffer}
 */
export { UNIT6, makeTestContext, joinFutarchy, makeProposal, createInstance, makeUser, joinFutarchyAndMakeOffers };