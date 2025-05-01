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
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { Far } from '@endo/far';
import { M, getCopyBagEntries } from '@endo/patterns';
import { AssetKind } from '@agoric/ertp/src/amountMath.js';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
//import '@agoric/zoe/exported.js';



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
export const start = async zcf => {
  const {
    joinFutarchyFee,
    duration,
    brands
  } = zcf.getTerms();

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

  /*const offerProposalShape = harden ({
    give: { CashNo: M.or(M.bigint(), M.undefined()), CashYes: M.or(M.bigint(), M.undefined()), SharesNo: M.or(M.bigint(), M.undefined()), SharesYes: M.or(M.bigint(), M.undefined()) },
    want: { 
      CashNo: M.or(M.bigint(), M.undefined()),
      CashYes: M.or(M.bigint(), M.undefined()),
      SharesNo: M.or(M.bigint(), M.undefined()),
      SharesYes: M.or(M.bigint(), M.undefined()) },
    exit: M.any(),
  });*/

  const offerProposalShape = harden ({
    give: { CashYes: M.any( )},
    want: M.any(),
    exit: M.any(),
  });

  const joinProposalShape = harden ({
    give: { Price: M.eq(joinFutarchyFee) },
    want: {},
    exit: M.any(),
  });

  /** a seat for allocating proceeds of sales */
  const proceeds = zcf.makeEmptySeatKit().zcfSeat;

  /** @type { import ("@agoric/zoe").OfferHandler } */
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

  const makeOfferHandler = async (seat, offerArgs) => {
    console.log('OFFER ARGS', offerArgs);
    //TODO: must use continuous invitation pattern to cancel
    /*const { offerData } = offerArgs;
    const offerSecret = offerData.secret;

    if (certificateIds.has(currentId)) {
      throw Error(`Certificate ID ${currentId} already exists`);
    }

    certificateIds.add(currentId);

    const edCertNode = await E(recordsDataRoot).makeChildNode(
      certificateData.certificateId,
    );

    await E(edCertNode).setValue(JSON.stringify(certificateData));*/

    /**
     * @param {ZCFSeat} seat
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

    seat.exit();

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

  // Mark the publicFacet Far, i.e. reachable from outside the contract
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
