import { AgoricChainStoragePathKind as Kind } from '@agoric/rpc';

export interface WatcherHandler {
    kind: Kind,
    address: string,
    handle: (data: any) => void,
    previous?: any,
    onChangeOnly: boolean
}