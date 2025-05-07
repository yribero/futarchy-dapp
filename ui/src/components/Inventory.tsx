import { stringifyAmountValue } from '@agoric/ui-components';

type InventoryProps = {
  address: string;
  purses: Purse[]
};


const Inventory = ({ address, purses }: InventoryProps) => (
  <div className="trade" style={{ width: '100%' }}>
    <div className='card' style={{ width: '100%' }}>
      <div className='row-center'>
        <div style={{ width: '100%' }}>
          <h3>My Wallet</h3>
        </div>
      </div>
      <div className='row-center'>
        <table style={{ width: '100%' }}>
          <thead />
          <tbody>
            <tr key={address}>
              <td style={{ textAlign: 'right', width: '50%', paddingRight: '1em' }}><b>Current Address:</b></td>
              <td style={{ textAlign: 'left', width: '50%' }}>{address}</td>
            </tr>
            {purses ? purses.map((purse) => {
              return (
                <tr style={{ textAlign: 'left' }} key={purse.brandPetname}>
                  <td style={{ textAlign: 'right', width: '50%', paddingRight: '1em' }}><b>{purse.brandPetname}:</b></td>
                  <td style={{ textAlign: 'left', width: '50%' }}>
                    {stringifyAmountValue(
                      purse?.currentAmount,
                      purse?.displayInfo.assetKind,
                      purse.brandPetname === 'IST' ? purse?.displayInfo.decimalPlaces : 6,
                    )}
                  </td>
                </tr>
              )
            }) : ''}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export { Inventory };
