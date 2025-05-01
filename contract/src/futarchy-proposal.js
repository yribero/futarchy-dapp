// @ts-check
import { E } from '@endo/far';
import { makeMarshal } from '@endo/marshal';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

console.warn('start proposal module evaluating');

const { Fail } = assert;

// vstorage paths under published.*
const BOARD_AUX = 'boardAux';

const marshalData = makeMarshal(_val => Fail`data only`);

const IST_UNIT = 1_000_000n;
const CENT = IST_UNIT / 100n;

/**
 * @import {ERef} from '@endo/far';
 * @import {StorageNode} from '@agoric/internal/src/lib-chainStorage.js';
 * @import {BootstrapManifest} from '@agoric/vats/src/core/lib-boot.js';
 */

/**
 * Make a storage node for auxilliary data for a value on the board.
 *
 * @param {ERef<StorageNode>} chainStorage
 * @param {string} boardId
 */
const makeBoardAuxNode = async (chainStorage, boardId) => {
  const boardAux = E(chainStorage).makeChildNode(BOARD_AUX);
  return E(boardAux).makeChildNode(boardId);
};

const publishBrandInfo = async (chainStorage, board, brand) => {
  const [id, displayInfo] = await Promise.all([
    E(board).getId(brand),
    E(brand).getDisplayInfo(),
  ]);
  const node = makeBoardAuxNode(chainStorage, id);
  const aux = marshalData.toCapData(harden({ displayInfo }));
  await E(node).setValue(JSON.stringify(aux));
};

// TODO get these from agoric-sdk
/** @typedef {Record<string, any>} BootstrapPowers */

/**
 *
 * Core eval script to start contract
 *
 * @param {BootstrapPowers} permittedPowers
 */
export const startFutarchyContract = async permittedPowers => {
  console.error('startFutarchyContract()...');
  const {
    consume: { board, chainStorage, startUpgradable, zoe },
    brand: {
      consume: { IST: istBrandP },
      produce: {
        Item: produceItemBrand,
        CashNo: produceCashNoBrand,
        CashYes: produceCashYesBrand,
        SharesNo: produceSharesNoBrand,
        SharesYes: produceSharesYesBrand
      },
    },
    issuer: {
      consume: { IST: istIssuerP },
      produce: { 
        Item: produceItemIssuer,
        CashNo: produceCashNoIssuer,
        CashYes: produceCashYesIssuer,
        SharesNo: produceSharesNoIssuer,
        SharesYes: produceSharesYesIssuer
      },
    },
    installation: {
      consume: { futarchy: futarchyInstallationP },
    },
    instance: {
      produce: { futarchy: produceInstance },
    },
  } = permittedPowers;

  const istIssuer = await istIssuerP;
  const istBrand = await istBrandP;

  const terms = { 
    joinFutarchyFee: AmountMath.make(istBrand, 100n * IST_UNIT),
    duration: BigInt (60 * 60 * 24 * 7)
  };

  // agoricNames gets updated each time; the promise space only once XXXXXXX
  const installation = await futarchyInstallationP;

  const { instance } = await E(startUpgradable)({
    installation,
    issuerKeywordRecord: { Price: istIssuer },
    label: 'futarchy',
    terms,
  });
  console.log('CoreEval script: started contract', instance);

  const val = await E(zoe).getTerms(instance);

  const {
    brands: { CashNo, CashYes, SharesNo, SharesYes,Item },
    issuers: { issuer },
  } = val;

  console.log('CoreEval script: share via agoricNames:', CashNo);

  produceInstance.reset();
  produceInstance.resolve(instance);

  produceItemBrand.reset();
  produceCashNoBrand.reset();
  produceCashYesBrand.reset();
  produceSharesNoBrand.reset();
  produceSharesYesBrand.reset();

  produceItemIssuer.reset();
  produceCashNoIssuer.reset();
  produceCashYesIssuer.reset();
  produceSharesNoIssuer.reset();
  produceSharesYesIssuer.reset();

  produceItemBrand.resolve(Item);
  produceCashNoBrand.resolve(CashNo);
  produceCashYesBrand.resolve(CashYes);
  produceSharesNoBrand.resolve(SharesNo);
  produceSharesYesBrand.resolve(SharesYes);

  produceItemIssuer.resolve(issuer);
  produceCashNoIssuer.resolve(issuer);
  produceCashYesIssuer.resolve(issuer);
  produceSharesNoIssuer.resolve(issuer);
  produceSharesYesIssuer.resolve(issuer);

  await publishBrandInfo(chainStorage, board, Item);
  await publishBrandInfo(chainStorage, board, CashNo);
  await publishBrandInfo(chainStorage, board, CashYes);
  await publishBrandInfo(chainStorage, board, SharesNo);
  await publishBrandInfo(chainStorage, board, SharesYes);
  
  console.log('futarchy (re)started');
};

/** @type {BootstrapManifest} */
const futarchyManifest = {
  [startFutarchyContract.name]: {
    consume: {
      agoricNames: true,
      board: true, // to publish boardAux info for NFT brand
      chainStorage: true, // to publish boardAux info for NFT brand
      startUpgradable: true, // to start contract and save adminFacet
      zoe: true, // to get contract terms, including issuer/brand
    },
    installation: { consume: { futarchy: true } },
    issuer: { consume: { IST: true }, produce: { Item: true, CashNo: true, CashYes: true, SharesNo: true, SharesYes: true } },
    brand: { consume: { IST: true }, produce: { Item: true, CashNo: true, CashYes: true, SharesNo: true, SharesYes: true } },
    instance: { produce: { futarchy: true } },
  },
};
harden(futarchyManifest);

export const getManifestForFutarchy = ({ restoreRef }, { futarchyRef }) => {
  return harden({
    manifest: futarchyManifest,
    installations: {
      futarchy: restoreRef(futarchyRef),
    },
  });
};
