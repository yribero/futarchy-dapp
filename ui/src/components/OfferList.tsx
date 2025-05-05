import { DamOffer } from "../helpers/FutarchyTypes";

type OfferListProps = {
    type: string;
    address: string;
    list: Array<DamOffer> | undefined;
}

const OfferList = (({ list, type, address }: OfferListProps) => {

    const UNIT6 = 1_000_000n;

    return (
        <>
            <div className="trade" style={{ width: 150 }}>
                <b>{type}</b>
                <ul className="barelist">
                    {list ? list.map((offer) => {
                        return <li key={ offer.id }>{(offer.price / UNIT6).toString()} {offer.address === address ? '*' : ''}</li>
                    }): ''}
                </ul>
            </div>
        </>
    );
});

export { OfferList };