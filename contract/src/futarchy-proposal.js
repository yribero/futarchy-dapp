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
  console.log('BRAND', brand);

  const [id, displayInfo] = await Promise.all([
    E(board).getId(brand),
    E(brand).getDisplayInfo(),
  ]);

  console.log('DISPLAY INFO', displayInfo);
  console.log('ID', id);

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
    consume: { board, chainStorage, startUpgradable, zoe, chainTimerService },
    brand: {
      consume: { IST: istBrandP },
      produce: {
        CashNo: produceCashNoBrand,
        CashYes: produceCashYesBrand,
        SharesNo: produceSharesNoBrand,
        SharesYes: produceSharesYesBrand
      },
    },
    issuer: {
      consume: { IST: istIssuerP },
      produce: { 
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
    duration: BigInt (60 * 5)
  };

  const storageNode = await E(chainStorage).makeChildNode('futarchy');

  // agoricNames gets updated each time; the promise space only once XXXXXXX
  const installation = await futarchyInstallationP;

  const { instance } = await E(startUpgradable)({
    installation,
    issuerKeywordRecord: { Price: istIssuer },
    label: 'futarchy',
    terms,
    privateArgs: {
      storageNode,
      board,
      timerService: await chainTimerService,
    },
  });
  console.log('CoreEval script: started contract', instance);

  const val = await E(zoe).getTerms(instance);

  const {
    brands: { 
      CashNo: cnb,
      CashYes: cyb,
      SharesNo: snb,
      SharesYes: syb
    },
    issuers: { 
      CashNo: cni,
      CashYes: cyi,
      SharesNo: sni,
      SharesYes: syi
    },
  } = val;

  produceInstance.reset();
  produceInstance.resolve(instance);

  produceCashNoBrand.reset();
  produceCashYesBrand.reset();
  produceSharesNoBrand.reset();
  produceSharesYesBrand.reset();

  produceCashNoIssuer.reset();
  produceCashYesIssuer.reset();
  produceSharesNoIssuer.reset();
  produceSharesYesIssuer.reset();

  produceCashNoBrand.resolve(await cnb);
  produceCashYesBrand.resolve(await cyb);
  produceSharesNoBrand.resolve(await snb);
  produceSharesYesBrand.resolve(await syb);

  produceCashNoIssuer.resolve(await cni);
  produceCashYesIssuer.resolve(await cyi);
  produceSharesNoIssuer.resolve(await sni);
  produceSharesYesIssuer.resolve(await syi);

  for (let brand of [cnb, cyb, snb, syb]) {
    try {
      await publishBrandInfo(chainStorage, board, brand);
    } catch (e) {
      console.error('COULD NOT PUBLISH A BRAND', e);
    }
  }
  
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
      chainTimerService: true,
    },
    installation: { consume: { futarchy: true } },
    issuer: { consume: { IST: true }, produce: { CashNo: true, CashYes: true, SharesNo: true, SharesYes: true } },
    brand: { consume: { IST: true }, produce: { CashNo: true, CashYes: true, SharesNo: true, SharesYes: true } },
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
