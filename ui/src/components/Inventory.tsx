import { stringifyAmountValue } from '@agoric/ui-components';

type InventoryProps = {
  address: string;
  purses: Purse[]
};


const Inventory = ({ address, purses }: InventoryProps) => (
  <div className="card">
    <h3>My Wallet</h3>
    <div>
      <div style={{ textAlign: 'left' }}>
        <b>Current Address: </b><code>{address}</code>
      </div>

      {purses ? purses.map((purse) => {
        return <div style={{ textAlign: 'left' }} key={purse.brandPetname}>
          <div>
            <b>{purse.brandPetname}: </b>
            {stringifyAmountValue(
              purse?.currentAmount,
              purse?.displayInfo.assetKind,
              purse.brandPetname === 'IST' ? purse?.displayInfo.decimalPlaces : 6,
            )}
          </div>
        </div>
      }): ''}
      
    </div>
  </div>
);

export { Inventory };
