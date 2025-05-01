/**
 * @file Permission Contract Deployment builder
 *
 * Creates files for starting an instance of the contract:
 * * contract source and instantiation proposal bundles to be published via
 *   `agd tx swingset install-bundle`
 * * start-futarchy-permit.json and start-futarchy.js to submit the
 *   instantiation proposal via `agd tx gov submit-proposal swingset-core-eval`
 *
 * Usage:
 *   agoric run build-contract-deployer.js
 */

import { makeHelpers } from '@agoric/deploy-script-support';
import { getManifestForFutarchy } from '../src/futarchy-proposal.js';

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const FutarchyProposalBuilder = async ({ publishRef, install }) => {
  return harden({
    sourceSpec: '../src/futarchy-proposal.js',
    getManifestCall: [
      getManifestForFutarchy.name,
      {
        futarchyRef: publishRef(
          install(
            '../src/futarchy.contract.js',
            '../bundles/bundle-futarchy.js',
            {
              persist: true,
            },
          ),
        ),
      },
    ],
  });
};

/** @type {DeployScriptFunction} */
export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('start-futarchy', FutarchyProposalBuilder);
};
