import { Far } from '@endo/marshal';
import { makeScalarMapStore } from '@agoric/store';

/**
 * @param {ZCF} zcf
 */
const start = async (zcf) => {
  // Create a durable map to persist invitations
  const invitationStore = makeScalarMapStore('InvitationStore');

  let counter = 0;

  /** @type {(handle: string) => Invitation} */
  const getInvitation = (handle) => {
    if (!invitationStore.has(handle)) {
      throw new Error('No such invitation');
    }
    return invitationStore.get(handle);
  };

  /** @type {() => string} */
  const createInvitation = () => {
    const handler = async (seat, offerArgs) => {
      seat.exit();
      return 'Offer accepted!';
    }

    const invitation = zcf.makeInvitation(handler, 'custom invitation');

    const handle = `inv-${counter++}`;

    invitationStore.init(handle, invitation);

    return handle;
  };

  const publicFacet = Far('publicFacet', {
    createInvitation,
    getInvitation,
  });

  return harden({ publicFacet });
};
harden(start);
