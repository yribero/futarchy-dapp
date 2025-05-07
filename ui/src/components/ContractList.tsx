import { DoneDeal } from "../helpers/FutarchyTypes";
import { formatBigInt } from "../helpers/helpers";

type ContractListProps = {
    list: Array<DoneDeal> | undefined;
}

const ContractList = (({ list }: ContractListProps) => {

    return (
        <>
            <div className="trade" style={{ width: 150 }}>
                <b>Done Deals ({list ? list.length : 0})</b>
                <ul className="barelist">
                    {list ? list.map((deal) => {
                        return <li key={deal.id}>{formatBigInt(deal.price)}</li>
                    }): ''}
                </ul>
            </div>
        </>
    );
});

export { ContractList };