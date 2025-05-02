import { DoneDeal } from "../helpers/FutarchyTypes";

type ContractListProps = {
    list: Array<DoneDeal> | undefined;
}

const ContractList = (({ list }: ContractListProps) => {

    return (
        <>
            <div className="trade" style={{ width: 150 }}>
                <b>Contracts</b>
                <ul className="barelist">
                    {list ? list.map((deal) => {
                        return <li key={deal.id}>{deal.price}</li>
                    }): ''}
                </ul>
            </div>
        </>
    );
});

export { ContractList };