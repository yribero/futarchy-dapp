import { DamOffer } from "../helpers/FutarchyTypes";

type OfferListProps = {
    type: string;
    address: string;
    list: Array<DamOffer> | undefined;
}

const OfferList = (({ list, type, address }: OfferListProps) => {

    return (
        <>
            <div className="trade" style={{ width: 150 }}>
                <b>{type}</b>
                <ul className="barelist">
                    {list ? list.map((offer) => {
                        return <li key={ offer.id }>{offer.price} {offer.address === address ? '*' : ''}</li>
                    }): ''}
                </ul>
            </div>
        </>
    );
});

export { OfferList };