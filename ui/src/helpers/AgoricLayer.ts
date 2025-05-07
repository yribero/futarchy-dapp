import {
    makeAgoricChainStorageWatcher,
    AgoricChainStoragePathKind as Kind,
} from '@agoric/rpc';
import {
    makeAgoricWalletConnection,
    suggestChain,
} from '@agoric/web-components';
import { deepEqual } from '../helpers/helpers.ts';
import { WatcherHandler } from '../helpers/AgoricExtendedTypes.ts'
import { StoreApi, UseBoundStore } from 'zustand';
import AppState from './AppState.ts';
import { subscribeLatest } from '@agoric/notifier';

export default class AgoricLayer {

    ENDPOINTS: {
        RPC: string,
        API: string
    };

    watcher;

    handlers: WatcherHandler[] = [];

    constructor(url: URL) {
        if (url.hostname === 'llm-test.yary.eu') {
            this.ENDPOINTS = {
                RPC: `${url.protocol}//${url.hostname}/rpc/`,
                API: `${url.protocol}//${url.hostname}/api/`,
            };
        } else {
            this.ENDPOINTS = {
                RPC: `${url.protocol}//${url.hostname}:26657`,
                API: `${url.protocol}//${url.hostname}:1317`,
            };
        }

        const codeSpaceHostName = import.meta.env.VITE_HOSTNAME;

        const codeSpaceDomain = import.meta.env
            .VITE_GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

        if (codeSpaceHostName) {
            this.ENDPOINTS.API = `https://${codeSpaceHostName}-1317.${codeSpaceDomain}`;
            this.ENDPOINTS.RPC = `https://${codeSpaceHostName}-26657.${codeSpaceDomain}`;
        }
        if (codeSpaceHostName && codeSpaceDomain) {
            this.ENDPOINTS.API = `https://${codeSpaceHostName}-1317.${codeSpaceDomain}`;
            this.ENDPOINTS.RPC = `https://${codeSpaceHostName}-26657.${codeSpaceDomain}`;
        } else {
            console.warn(
                'Missing environment variables: VITE_HOSTNAME or VITE_GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN',
            );
        }

        console.log('Endpoints API: ' + this.ENDPOINTS.API);
        console.log('Endpoints RPC: ' + this.ENDPOINTS.RPC);

        this.watcher = makeAgoricChainStorageWatcher(this.ENDPOINTS.API, 'agoriclocal');
    }

    startWatcher<Type>(kind: Kind, address: string, handle: (data: Type) => void, onChangeOnly: boolean) {
        this.handlers.push({
            kind,
            address,
            handle,
            onChangeOnly
        });

        console.log('ADDED HANDLER TO ' + address, kind);
        this.watcher.watchLatest<Type>(
            [kind, address],
            data => {
                const handlers = this.handlers.filter(h => h.kind === kind && h.address === address);

                if (handlers.length === 0) {
                    return;
                }

                handlers.forEach(handler => {
                    if (handler.onChangeOnly && deepEqual(data, handler.previous)) {
                        return;
                    }

                    handler.handle(data);

                    handler.previous = data;
                })
            },
        );
    }

    registerWatcherHandler(handler: WatcherHandler) {
        this.handlers.push(handler);
    }

    async connectWallet(useAppStore: UseBoundStore<StoreApi<AppState>>) {
        await suggestChain('https://local.agoric.net/network-config');
        const wallet = await makeAgoricWalletConnection(this.watcher, this.ENDPOINTS.RPC);
        useAppStore.setState({ wallet }, false);

        const { pursesNotifier } = wallet;

        for await (const purses of subscribeLatest<Purse[]>(pursesNotifier)) {
            useAppStore.setState({ purses }, false);

            if (useAppStore.getState().purses?.find(p => p.brandPetname === 'CashYes') != null) {
                useAppStore.setState({joined: true}, false);

                const { approved } = useAppStore.getState();

                let cashPurse;
                let sharesPurse;

                if (approved === false) {
                    cashPurse = purses.find(p => p.brandPetname === 'CashNo');
                    sharesPurse = purses.find(p => p.brandPetname === 'SharesNo');
                } else if (approved === true) {
                    cashPurse = purses.find(p => p.brandPetname === 'CashYes');
                    sharesPurse = purses.find(p => p.brandPetname === 'SharesYes');
                }

                const redeemed = cashPurse?.currentAmount.value === 0n && sharesPurse?.currentAmount.value === 0n;
        
                useAppStore.setState({ 
                    redeemed
                }, false);
            }


            const { contractInstance } = useAppStore.getState();

            this.watcher.watchLatest<Array<[string, unknown]>>(
                [Kind.Data, `published.wallet.${wallet.address}`],
                async (status: any) => {
                    if (
                        status == null
                        || status.updated != "offerStatus"
                        || status.status == null
                        || status.status.invitationSpec == null
                        || status.status.invitationSpec.instance == null
                        || status.status.invitationSpec.instance != contractInstance
                    ) {
                        return;
                    }

                    console.log(`Was there an error? ${status?.status?.error}`)
                    useAppStore.setState({ error: status?.status?.error }, false);
                },
            );
        }
    }

    async queryOnce<T>(kind: Kind, address: string) {
        return await this.watcher.queryOnce<T>([kind, address]);
    }
}