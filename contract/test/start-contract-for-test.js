import { E } from '@endo/far';
import '@agoric/zoe/src/zoeService/types-ambient.js';
import { AmountMath } from '@agoric/ertp';
import { makeMockChainStorageRoot } from '@agoric/internal/src/storage-test-utils.js';

const UNIT6 = 1_000_000n;


const startContract = async ({ zoe, bundle }) => {
    const installation = E(zoe).install(bundle);
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const joinFutarchyFee = AmountMath.make(feeBrand, 100n * UNIT6);
    const chainStorage = makeMockChainStorageRoot();

    return E(zoe).startInstance(
        installation,
        { Price: feeIssuer },
        { joinFutarchyFee },
        {
            storageNode: chainStorage.makeChildNode('futarchy'),
            board: chainStorage.makeChildNode('boardAux'),
        }
    );
};

export { startContract };