/**
 * @file Contract to mint and sell a few Item NFTs at a time.
 *
 * We declare variables (including functions) before using them,
 * so you may want to skip ahead and come back to some details.
 * @see {start} for the main contract entrypoint
 *
 * As is typical in Zoe contracts, the flow is:
 *   1. contract does internal setup and returns public / creator facets.
 *   2. client uses a public facet method -- {@link makeTradeInvitation} in this case --
 *      to make an invitation.
 *   3. client makes an offer using the invitation, along with
 *      a proposal (with give and want) and payments. Zoe escrows the payments, and then
 *   4. Zoe invokes the offer handler specified in step 2 -- here {@link tradeHandler}.
 *
 * @see {@link https://docs.agoric.com/guides/zoe/|Zoe Overview} for a walk-thru of this contract
 * @see {@link https://docs.agoric.com/guides/js-programming/hardened-js.html|Hardened JavaScript}
 * for background on `harden` and `assert`.
 */
// @ts-check
// @jessie-check
import { E, Far } from '@endo/far';
import { M, getCopyBagEntries } from '@endo/patterns';
import { AssetKind, assertValueGetHelpers } from '@agoric/ertp/src/amountMath.js';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import '@agoric/zoe/exported.js';

/**
 * @import {Amount} from '@agoric/ertp/src/types.js';
 *
 */
const { Fail, quote: q } = assert;

const UNIT = 1_000_000n;
const CENT = UNIT / 100n;

const SHARES = 100n;
const CASH = 10_000n;

/**
 * In addition to the standard `issuers` and `brands` terms,
 * this contract is parameterized by terms for price and,
 * optionally, a maximum number of items sold for that price (default: 3).
 *
 * @typedef {{
 *   joinFutarchyFee: Amount;
 *   duration: bigint;
 * }} FutarchyTerms
 */

export const meta = {
  customTermsShape: M.splitRecord(
    { joinFutarchyFee: AmountShape },
    { duration: M.bigint() }
  ),
};
harden(meta);
// compatibility with an earlier contract metadata API
export const customTermsShape = meta.customTermsShape;
harden(customTermsShape);

/**
 * Start a contract that
 *   - creates a new non-fungible asset type for Items, and
 *   - handles offers to buy up to `maxItems` items at a time.
 *
 * @param { ZCF<FutarchyTerms>} zcf
 */
export const start = async (zcf, privateArgs) => {
  const {
    joinFutarchyFee,
    duration,
    brands
  } = zcf.getTerms();

  const history = [];
  const offers = [];
  const doneDeals = [];

  const notes = await E(privateArgs.storageNode).makeChildNode('history');
  const publishedAsks = await E(privateArgs.storageNode).makeChildNode('offers');
  const publishedContracts = await E(privateArgs.storageNode).makeChildNode('doneDeals');
  const publishedMedians = await E(privateArgs.storageNode).makeChildNode('medians');
  const publishedApproved = await E(privateArgs.storageNode).makeChildNode('approved');
  /**
   * a new ERTP mint for items, accessed thru the Zoe Contract Facet.
   * Note: `makeZCFMint` makes the associated brand and issuer available
   * in the contract's terms.
   */
  const cashNoMint  = await zcf.makeZCFMint('CashNo');
  const { brand: cashNoBrand } = cashNoMint.getIssuerRecord();

  const cashYesMint  = await zcf.makeZCFMint('CashYes');
  const { brand: cashYesBrand } = cashYesMint.getIssuerRecord();

  const sharesNoMint  = await zcf.makeZCFMint('SharesNo');
  const { brand: sharesNoBrand } = sharesNoMint.getIssuerRecord();

  const sharesYesMint  = await zcf.makeZCFMint('SharesYes');
  const { brand: sharesYesBrand } = sharesYesMint.getIssuerRecord();

  const offerProposalShape = harden ({
    give: M.or(
      {CashYes: M.gt(AmountMath.make(cashYesBrand, 0n))},
      {CashNo: M.gt(AmountMath.make(cashNoBrand, 0n))},
      {SharesYes: M.eq(AmountMath.make(sharesYesBrand, 1n * UNIT))}, //TODO allow to trade more than a share
      {SharesNo: M.eq(AmountMath.make(sharesNoBrand, 1n * UNIT))} //TODO allow to trade more than a share
    ),
    want: M.or(
      {CashYes: M.gt(AmountMath.make(cashYesBrand, 0n))},
      {CashNo: M.gt(AmountMath.make(cashNoBrand, 0n))},
      {SharesYes: M.eq(AmountMath.make(sharesYesBrand, 1n * UNIT))}, //TODO allow to trade more than a share
      {SharesNo: M.eq(AmountMath.make(sharesNoBrand, 1n * UNIT))} //TODO allow to trade more than a share
    ),
    exit: M.any(),
  });

  const joinProposalShape = harden ({
    give: { Price: M.eq(joinFutarchyFee) },
    want: {},
    exit: M.any(),
  });

  /** a seat for allocating proceeds of sales */
  const proceeds = zcf.makeEmptySeatKit().zcfSeat;

  const joinFutarchyHandler = joinerSeat => {
    const newCashNo = cashNoMint.mintGains({ CashNo: AmountMath.make(cashNoBrand, CASH * UNIT) });
    const newCashYes = cashYesMint.mintGains({ CashYes: AmountMath.make(cashYesBrand, CASH * UNIT) });
    const newSharesNo = sharesNoMint.mintGains({ SharesNo: AmountMath.make(sharesNoBrand, SHARES * UNIT) });
    const newSharesYes = sharesYesMint.mintGains({ SharesYes: AmountMath.make(sharesYesBrand, SHARES * UNIT) });

    atomicRearrange(
      zcf,
      harden([
        // price from buyer to proceeds
        [joinerSeat, proceeds, { Price: joinFutarchyFee }],
        // new items to buyer
        [newCashNo, joinerSeat, { CashNo: AmountMath.make(cashNoBrand, CASH * UNIT) }],
        [newCashYes, joinerSeat, { CashYes: AmountMath.make(cashYesBrand, CASH * UNIT) }],
        [newSharesNo, joinerSeat, { SharesNo: AmountMath.make(sharesNoBrand, SHARES * UNIT) }],
        [newSharesYes, joinerSeat, { SharesYes: AmountMath.make(sharesYesBrand, SHARES * UNIT) }]
      ]),
    );

    joinerSeat.exit(true);

    newCashNo.exit();
    newCashYes.exit();
    newSharesNo.exit();
    newSharesYes.exit();

    return 'trade complete';
  }

  const joinFutarchy = () => {
    return zcf.makeInvitation(joinFutarchyHandler, 'Join Futarchy', undefined, joinProposalShape);
  }
  
/**
 * @returns { {
 *  CASH: bigint,
 *  SHARES: bigint
 *  UNIT: bigint
 *  CENT: bigint
 * } }
 */
  const getLimits = () => {
    return {
      CASH,
      SHARES,
      UNIT,
      CENT
    }
  }

  /**
   * @param {import ("@agoric/zoe").ZCFSeat} seat
   */
  const makeOfferHandler = async (seat, offerArgs) => {
    console.log('OFFER ARGS', offerArgs);

    const {want, give} = seat.getProposal();

    console.log('PROPOSAL', {want, give});

    const matches = {
      "SharesYes": "CashYes",
      "SharesNo": "CashNo",
      "CashYes": "SharesYes",
      "CashNo": "SharesYes"
    }

    for (let key in matches) {
      if (want[key] == null && give[matches[key]] == null) {
        continue;
      }

      if (want[key] != null) {
        assert(
          want[key] != null && give[matches[key]] != null,
          `Mismatch: a request of ${key} should have a matching offer of ${matches[key]}`
        );
      }
    }

    /**
     * @param {import ("@agoric/zoe").ZCFSeat} seat
     */
    const oa = async (seat, offerArgs) => {
      console.log('OFFER ARGS', offerArgs);

      /*const { offerData } = offerArgs;

      if (offerData.secret !== offerSecret) {
        throw new Error('Certificate ID mismatch');
      }*/

      seat.exit();
      return secondInviteObj;
    }

    //seat.exit(); Only if the offer is resolved

    const secondInviteObj =  harden({
      invitationMakers: Far('second invitation maker', {
        makeSecondInvitation: () =>
          zcf.makeInvitation(
            /*async (seat, offerArgs) => {
              const { offerData } = offerArgs;

              if (offerData.secret !== offerSecret) {
                throw new Error('Certificate ID mismatch');
              }

              await E(edCertNode).setValue(JSON.stringify(certificateData));
              seat.exit();
              return secondInviteObj;
            }*/oa,

            'SecondInvite',
          ),
      }),
    });

    return secondInviteObj;
  }

  const cancelOffer  = async (seat, offerArgs) => {
    console.log('CANCEL ARGS', offerArgs);
    //TODO: with the continuous invitation pattern
  }

  const redeem  = async (seat, offerArgs) => {
    //TODO: exchange cash and shares for IST
  }

  const makeOffer = () => {
    console.log('Making an offer');

    return zcf.makeInvitation(
      makeOfferHandler,
      'publish offer data',
      undefined,
      offerProposalShape,
    );
  }

  // Mark the publicFacet Far, i.e. reachable from outside the `contract
  const publicFacet = Far('Items Public Facet', {
    joinFutarchy,
    getLimits,
    makeOffer,
    cancelOffer,
    redeem
  });
  return harden({ publicFacet });
};
harden(start);
