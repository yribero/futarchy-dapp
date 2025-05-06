/**
 * @file Contract to mint and sell a few Item NFTs at a time.
 *
 * We declare variables (including functions) before using them,
 * so you may want to skip ahead and come back to some details.
 * @see {start} for the main contract entrypoint
 *
 * @see {@link https://docs.agoric.com/guides/zoe/|Zoe Overview} for a walk-thru of this contract
 * @see {@link https://docs.agoric.com/guides/js-programming/hardened-js.html|Hardened JavaScript}
 * for background on `harden` and `assert`.
 */
// @ts-check
// @jessie-check
import { E, Far } from '@endo/far';
import { M } from '@endo/patterns';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { atomicRearrange, atomicTransfer } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { AmountMath } from '@agoric/ertp';

/**
 * @import {TimerService} from '@agoric/time'
 * @import {Amount} from '@agoric/ertp/src/types.js';
 * @import {AmountKeywordRecord, ZCFSeat} from '@agoric/zoe';
 */

const UNIT = 1_000_000n;
const CENT = UNIT / 100n;

const SHARES = 100n;
const CASH = 10_000n;

/**
 * @typedef {{ 
 *     timerBrand: any;
 *     absValue: bigint;
 * }} TimestampRecord
 * 
 * @typedef {{
 *    type: "child" | "update";
 *    parent?: any;
 *    id?: any;
 *    node?: any;
 *    data: any;
 * }} PublishingPromise
 *
 * @typedef {{
 *    type: "ask" | "bid" | undefined;
 *    condition: 0 | 1 | undefined;
 *    amount: bigint;
 *    price: bigint;
 *    total: bigint;
 *    id: bigint;
 *    address: string;
 *    secret?: string;
 *    timestamp: any;
 *    taker: boolean;
 *    seat?: import ("@agoric/zoe").ZCFSeat;
 *    available?: boolean
 * }} Offer
 * 
 * @typedef {{
 *     id: bigint;
 *     from: string;
 *     to: string;
 *     condition: 0 | 1 ;
 *     amount: bigint;
 *     price: bigint;
 *     total: bigint;
 *     timestamp: bigint;
 * }} DoneDeal
*/

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

  let marshaller = await E(privateArgs.board).getPublishingMarshaller();

  /**
   * @type {TimerService}
   */
  let timerService = privateArgs.timerService;

  let nextOfferId = 0n;
  let nextDoneDealId = 0n;

  /**
   * @returns {bigint}
   */
  const getNextOfferId = () => {
    const id = nextOfferId;
    nextOfferId++;
    return id;
  }

  /**
   * @returns {bigint}
   */
  const getNextDoneDealId = () => {
    const id = nextDoneDealId;
    nextDoneDealId++;
    return id;
  }

  /**
   * @type {Offer[]}
   */
  const offers = [];

  /**
   * @type {DoneDeal[][]}
   */
  const doneDeals = [[], []];

  /**
   * @type {bigint []}
   */
  const medians = [0n, 0n];

  /**
   * @type {boolean}
   */
  let over = false;

  const publishedHistory = await E(privateArgs.storageNode).makeChildNode('history');
  const publishedOffers = await E(privateArgs.storageNode).makeChildNode('offers');
  const publishedDoneDeals = await E(privateArgs.storageNode).makeChildNode('doneDeals');
  const publishedMedians = await E(privateArgs.storageNode).makeChildNode('medians');
  const publishedOutcome = await E(privateArgs.storageNode).makeChildNode('outcome');

  /**
   * a new ERTP mint for items, accessed thru the Zoe Contract Facet.
   * Note: `makeZCFMint` makes the associated brand and issuer available
   * in the contract's terms.
   */
  const cashNoMint = await zcf.makeZCFMint('CashNo');
  const { brand: cashNoBrand } = cashNoMint.getIssuerRecord();

  const cashYesMint = await zcf.makeZCFMint('CashYes');
  const { brand: cashYesBrand } = cashYesMint.getIssuerRecord();

  const sharesNoMint = await zcf.makeZCFMint('SharesNo');
  const { brand: sharesNoBrand } = sharesNoMint.getIssuerRecord();

  const sharesYesMint = await zcf.makeZCFMint('SharesYes');
  const { brand: sharesYesBrand } = sharesYesMint.getIssuerRecord();

  const offerProposalShape = harden({
    give: M.or(
      { CashYes: M.gt(AmountMath.make(cashYesBrand, 0n)) },
      { CashNo: M.gt(AmountMath.make(cashNoBrand, 0n)) },
      { SharesYes: M.eq(AmountMath.make(sharesYesBrand, 1n * UNIT)) }, //TODO allow to trade more than a share
      { SharesNo: M.eq(AmountMath.make(sharesNoBrand, 1n * UNIT)) } //TODO allow to trade more than a share
    ),
    want: M.or(
      { CashYes: M.gt(AmountMath.make(cashYesBrand, 0n)) },
      { CashNo: M.gt(AmountMath.make(cashNoBrand, 0n)) },
      { SharesYes: M.eq(AmountMath.make(sharesYesBrand, 1n * UNIT)) }, //TODO allow to trade more than a share
      { SharesNo: M.eq(AmountMath.make(sharesNoBrand, 1n * UNIT)) } //TODO allow to trade more than a share
    ),
    exit: M.any(),
  });

  const joinProposalShape = harden({
    give: { Price: M.eq(joinFutarchyFee) },
    want: {},
    exit: M.any(),
  });

  const redeemProposalShape = harden({
    give: M.or(
      { CashNo: M.any(), SharesNo: M.any()},
      { CashYes: M.any(), SharesYes: M.any()}
    ),
    want: {},
    exit: M.any(),
  });

  const cancelProposalShape = harden({
    give: M.any(),
    want: M.any(),
    exit: M.any(),
  });

  /** a seat for allocating proceeds of sales */
  /**
   * @type {ZCFSeat}
   */
  const proceeds = zcf.makeEmptySeatKit().zcfSeat;

  new Promise(async () => { //Setting up a timer asynchronously
    await E(timerService).delay(duration);

    over = true;

    offers.forEach(offer => { //ALL REMAINING OPEN SEATS MUST BE CLOSED
      offer.seat?.exit();
    });

    let marshalledData = JSON.stringify(await E(marshaller).toCapData({
      "result": medians[1] >= medians[0],
      "explanation": medians[1] >= medians[0] ? "The proposal was approved" : "The proposal was rejected"
    }));

    await E(publishedOutcome).setValue(marshalledData);
  });

  /**
   * 
   * @param {string} assetName 
   * @param {*} value 
   * @returns {AmountKeywordRecord}
   */
  const getAmount = (assetName, value) => {
    switch (assetName) {
      case 'CashNo':
        return { CashNo: AmountMath.make(cashNoBrand, value) };
      case 'CashYes':
        return { CashYes: AmountMath.make(cashYesBrand, value) };
      case 'SharesNo':
        return { SharesNo: AmountMath.make(sharesNoBrand, value) };
      case 'SharesYes':
        return { SharesYes: AmountMath.make(sharesYesBrand, value) };
      default:
        throw new Error(`Could not match assetName '${assetName}' to any brand`);
    }
  }

   /**
   * 
   * @param {*} proposal 
   * @returns {AmountKeywordRecord}
   */
  const getWantAmount = (proposal) => {
    const assetName = Object.keys(proposal.want)[0];
    const value = proposal.want[assetName].value;

    return getAmount(assetName, value);
  }

  /**
 * 
 * @param {*} proposal 
 * @returns {AmountKeywordRecord}
 */
  const getGiveAmount = (proposal) => {
    const assetName = Object.keys(proposal.give)[0];
    const value = proposal.give[assetName].value;

    return getAmount(assetName, value);
  }

  /**
   * @param {DoneDeal} doneDeal
   * @returns {PublishingPromise}
   */
  const updateMedians = (doneDeal) => {
    assert(
      doneDeals[doneDeal.condition].length <= 7,
      `The maximum length of doneDeals.length[${doneDeal.condition}] must be 7. It was ${doneDeals[doneDeal.condition].length}` 
    );

    doneDeals[doneDeal.condition].push(doneDeal);

    if (doneDeals[doneDeal.condition].length > 7) {
      doneDeals[doneDeal.condition].shift();
    }

    const values = doneDeals[doneDeal.condition].map(dd => dd.price);

    if (values.length === 0) {
      medians[doneDeal.condition] = 0n;
    }
  
    // Sorting values, preventing original array
    // from being mutated.
    let lastSeven = [...values].sort((a, b) => {
      if (b > a) {
        return 1;
      } else if (b < a) {
        return -1;
      } else {
        return 0;
      }
    });;
  
    const half = Math.floor(lastSeven.length / 2);
  
    medians[doneDeal.condition] = (lastSeven.length % 2
      ? lastSeven[half]
      : (lastSeven[half - 1] + lastSeven[half]) / 2n
    );

    return {
      type: "update",
      node: publishedMedians,
      data: [... medians]
    }
  }

  /**
   * 
   * @param {Offer} offer
   * @param {TimestampRecord} ts
   * 
   * @returns {{
   *  resolved: boolean,
   *  publications: PublishingPromise[]
   * }}
   */
  const resolve = (offer, ts) => {
    /**
     * @type {PublishingPromise[]}
     */
    let publications = [];

    /**
     * @type {boolean}
     */
    let matched = false;

    let best;
    let from;
    let to;

    if (offer.type === 'ask') {
      best = getBestBid(offer.secret, offer.condition);

      if (best != null && best.price >= offer.price) {
        matched = true;

        from = offer.address;
        to = best.address;
      }
    } else if (offer.type === 'bid') {
      best = getBestAsk(offer.secret, offer.condition);

      if (best != null && best.price <= offer.price) {
        matched = true;

        from = best.address;
        to = offer.address;
      }
    } else {
      throw new Error('Your offer has no type');
    }

    if (matched && best != null) {
      atomicRearrange(
        zcf,
        harden([
          [offer.seat, best.seat, getWantAmount(best.seat?.getProposal())],
          [best.seat, offer.seat, getGiveAmount(best.seat?.getProposal())]
        ]),
      );

      best?.seat?.exit();
      offer?.seat?.exit();

      offer.available = false;
      best.available = false;

      //Remove best offer from the offer list
      const index = offers.findIndex(o => o.id === best.id);
      offers.splice(index, 1);

      /**
       * @type {DoneDeal}
       */
      const doneDeal = {
        id: getNextDoneDealId(),
        from: from || "",
        to: to || "",
        condition: best.condition || 0,
        amount: best.amount,
        price: best.price,
        total: best.total,
        timestamp: ts.absValue
      };

      publications.push(recordInPublishedOffer(offer));
      publications.push(recordInPublishedOffer(best));
      publications.push(recordDoneDeal(doneDeal));
      publications.push(updateMedians(doneDeal));
    } else {
      offer.available = true;

      publications.push(recordInPublishedOffer(offer));
    }

    return {
      resolved: matched,
      publications
    };
  };

  const publishChild = async (parent, id, data) => {
    const dataCopy = { ...data }; //The data will be hardened in the next method and will become immutable

    const child = await E(parent).makeChildNode(id.toString());

    let marshalledData = JSON.stringify(await E(marshaller).toCapData(dataCopy));

    await E(child).setValue(marshalledData);
  }

  const publishUpdate = async (node, data) => {
    const dataCopy = { ...data }; //The data will be hardened in the next method and will become immutable

    let marshalledData = JSON.stringify(await E(marshaller).toCapData(dataCopy));

    await E(node).setValue(marshalledData);
  }

  /**
   * 
   * @param {PublishingPromise[]} publications 
   */
  const publishAll = async (publications) => {
    for (let publication of publications) {
      if (publication.type === 'child') {
        await publishChild(publication.parent, publication.id, publication.data);
      } else {
        await publishUpdate(publication.node, publication.data);
      }
    }
  }

  /**
   * 
   * @param {Offer} offer 
   * 
   * @returns {PublishingPromise}
   */
  const recordInHistory = (offer) => {
    const offerToBeStored = { ...offer };

    delete offerToBeStored.available;
    delete offerToBeStored.seat;
    delete offerToBeStored.secret;

    return {
      type: "child",
      parent: publishedHistory,
      id: offer.id,
      data: offerToBeStored
    };
  };

  /**
 * 
 * @param {Offer} offer 
 * 
 * @returns {PublishingPromise}
 */
  const recordInPublishedOffer = (offer) => {
    const offerToBeStored = { ...offer };

    delete offerToBeStored.seat;
    delete offerToBeStored.secret;

    return {
      type: "child",
      parent: publishedOffers,
      id: offer.id,
      data: offerToBeStored
    };
  };

  /**
   * @param {DoneDeal} doneDeal
   * @returns {PublishingPromise}
   */
  const recordDoneDeal = (doneDeal) => {
    /**
     * @type {PublishingPromise}
     */
    return {
      type: "child",
      parent: publishedDoneDeals,
      id: doneDeal.id,
      data: { ...doneDeal }
    };
  }

  /**
   * @param {string | undefined} secret used to identify the owner
   * @param { 0 | 1 | undefined} condition
   * @returns {Offer | undefined}
   */
  const getBestAsk = (secret, condition) => {
    const asks = offers.filter(o => o.type === 'ask' && o.condition === condition && o.secret != secret);

    asks.sort((b1, b2) => {
      if (b1 > b2) {
        return 1;
      } else if (b1 < b2) {
        return -1;
      } else {
        return 0;
      }
    });

    return asks[0];
  }

  /**
   * @param {string | undefined} secret used to identify the owner
   * @param { 0 | 1 | undefined} condition
   * @returns {Offer | undefined}
   */
  const getBestBid = (secret, condition) => {
    const bids = offers.filter(o => o.type === 'bid' && o.condition === condition && o.secret != secret);

    bids.sort((b1, b2) => {
      if (b2 > b1) {
        return 1;
      } else if (b2 < b1) {
        return -1;
      } else {
        return 0;
      }
    });

    return bids[0];
  }

  const joinFutarchyHandler = async joinerSeat => {
    assert(!over, 'The game is over');

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

    return 'You joined futarchy';
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
    assert(!over, 'The game is over');

    /**
     * @type {TimestampRecord}
     */
    const ts = await E(timerService).getCurrentTimestamp();

    const { want, give } = seat.getProposal();

    /**
     * @type {PublishingPromise[]}
     */
    const publications = [];

    const matches = {
      "SharesYes": "CashYes",
      "SharesNo": "CashNo",
      "CashYes": "SharesYes",
      "CashNo": "SharesNo"
    }

    let price;
    let amount;

    /**
     * @type {"bid" | "ask" | undefined }
     */
    let type;

    /**
     * @type { 0 | 1 | undefined }
     */
    let condition;

    for (let key in matches) {
      if (want[key] == null && give[matches[key]] == null) {
        continue;
      }

      if (want[key] != null) {
        assert(
          want[key] != null && give[matches[key]] != null,
          `Mismatch: a request of ${key} should have a matching offer of ${matches[key]}`
        );

        if (["CashYes", "CashNo"].includes(key)) {
          price = want[key].value;
          amount = give[matches[key]].value;
          type = "ask";
        } else {
          amount = want[key].value;
          price = give[matches[key]].value;
          type = "bid";
        }

        if (["CashYes", "SharesYes"].includes(key)) {
          condition = 1;
        } else {
          condition = 0;
        }
      }
    }

    /**
     * @type {Offer}
     */
    const offer = {
      id: getNextOfferId(),
      price: price,
      amount: amount,
      total: BigInt(price * amount) / UNIT,
      type: type,
      address: offerArgs?.address,
      secret: offerArgs?.secret,
      available: true,
      timestamp: ts.absValue,
      taker: offerArgs?.taker,
      condition: condition,
      seat
    };

    // WRITE IN HISTORY

    publications.push(recordInHistory(offer));

    // RESOLVE
    const resolveResult = resolve(offer, ts);

    publications.push(...resolveResult.publications);

    if (!resolveResult.resolved) {
      //IF NOT RESOLVED, STORE
      offers.push(offer);
    }

    // PUBLISH ALL: publishing everything in the end to avoid using await in the middle of executing the contract logic

    await publishAll(publications);

    return resolveResult.resolved ? "Done deal" : "Offer added";
  }

  /**
   * 
   * @param {import ("@agoric/zoe").ZCFSeat} seat
   * @param {*} offerArgs 
   */
  const cancelOfferHandler = async (seat, offerArgs) => {
    assert(!over, 'The game is over');

    console.log('CANCEL ARGS', offerArgs);

    const offer = offers.find(offerArgs.id);

    assert(offer != null, `Offer ${offerArgs.id} was not found`);

    assert(
      offer.secret == offerArgs.secret,
      `You can't cancel offer ${offerArgs.id}, you are not the owner`
    );

    if (!offer.seat?.hasExited()) {
      offer.seat?.exit();
    }

    offer.available = false;

    await publishAll([recordInPublishedOffer(offer)]);

    seat.exit();
  }

  /**
   * 
   * @param {import ("@agoric/zoe").ZCFSeat} seat
   * @param {*} offerArgs 
   */
  const redeemHandler = async (seat, offerArgs) => {
    assert(over, 'The game is not over yet');

    const sharePrice = medians[1] >= medians[0] ? medians[1] : medians[0];

    let shareValue = Math.max(0, Math.min(200, Number(sharePrice))); //bound shareValue between 0 and 200 to avoid negative cash value

    console.log('INITIAL SHARE VALUE', shareValue);

    shareValue = Number (joinFutarchyFee.value / UNIT) / Number (SHARES) * shareValue / 200; //e.g. 50

    console.log('jff VALUE PART', Number (joinFutarchyFee.value / UNIT));
    console.log('SHARES VALUE PART', Number (SHARES));
    console.log('RATIO', Number (joinFutarchyFee.value / UNIT) / Number (SHARES) * shareValue);

    const cashValue = Number (joinFutarchyFee.value / UNIT) / Number(CASH) * (1 - shareValue) / 2; //e.g. 0.05

    let istValue = 0;

    console.log('SHARE VALUE', shareValue);
    console.log('CASH VALUE', cashValue);


    // 1. Create an empty seat to receive the partial amount
    const tempSeat = zcf.makeEmptySeatKit().zcfSeat;

    /**
     * @type {[a: ZCFSeat, b: ZCFSeat, c: AmountKeywordRecord][]}
     */
    const exchanges = [];

    Object.keys(seat.getProposal().give).forEach(assetName => {
      if (medians[1] >= medians[0] && (['CashNo', 'SharesNo'].includes(assetName)) ) {
        return;
      }

      if (medians[1] < medians[0] && (['CashYes', 'SharesYes'].includes(assetName)) ) {
        return;
      }

      let multiplier = 0;

      if (['CashNo', 'CashYes'].includes(assetName) ) {
        multiplier = cashValue;
      } else if (['SharesNo', 'SharesYes'].includes(assetName) ) {
        multiplier = shareValue;
      }

      istValue += Number(seat.getProposal().give[assetName].value) * multiplier;

      /**
       * @type {[a: ZCFSeat, b: ZCFSeat, c: AmountKeywordRecord]}
       */
      const exchange = [
        seat,
        tempSeat,
        getAmount(assetName, seat.getProposal().give[assetName].value)
      ];

      console.log('EXCHANGE', exchange);

      exchanges.push(exchange);

      console.log('EXCHANGES', exchanges);
    });

    const totalIstValue = BigInt(istValue);

    // 2. Decide how much to transfer (amount must be less than or equal to current allocation)
    const partialAmount = { Price: AmountMath.make(joinFutarchyFee.brand, totalIstValue) };

    console.log('PARTIAL AMOUNT', partialAmount)
    // 3. Decrement the original seat
    atomicTransfer(
      zcf,
      proceeds,
      tempSeat,
      partialAmount,
      partialAmount
    );

    console.log('IST REQUEST', totalIstValue / UNIT);

    console.log(proceeds);
    console.log('CURRENT ALLOCATION', proceeds.getCurrentAllocation());

    //console.log('TEMP SEAT', await tempSeat.getCurrentAllocation());

    //exchanges.push([proceeds, seat, { Price: AmountMath.make(joinFutarchyFee.brand, totalIstValue) }]);
    exchanges.push([tempSeat, seat, { Price: AmountMath.make(joinFutarchyFee.brand, totalIstValue) }]);

    console.log('EXCHANGES', exchanges);

    atomicRearrange(
      zcf,
      harden(exchanges)
    );

    tempSeat.exit();
    seat.exit();
  }

  const makeOffer = () => {
    return zcf.makeInvitation(
      makeOfferHandler,
      'Make Offer (bid| ask)',
      undefined,
      offerProposalShape,
    );
  }

  const redeem = () => {
    return zcf.makeInvitation(
      redeemHandler,
      'Redeem',
      undefined,
      redeemProposalShape,
    );
  }

  const cancelOffer = () => {
    return zcf.makeInvitation(
      cancelOfferHandler,
      'Cancel Offer',
      undefined,
      cancelProposalShape,
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
