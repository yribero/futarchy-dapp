export interface DamOffer {
    address: string;
    amount: bigint;
    id: bigint;
    price: bigint;
    available: boolean;
    taker: boolean;
    timestamp: number;
    type: string;
    condition: number;
    total: number;
}

export interface DoneDeal {
    id: number;
    condition: number;
    from: string;
    to: string;
    quantity: bigint,
    price: bigint;
    cash: bigint;
}

export interface ContractWallet {
    address: string;
    cash: Array<number>;
    shares: Array<number>;
}
