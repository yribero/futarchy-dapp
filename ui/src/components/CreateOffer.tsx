import { useState } from 'react';

class Offer {
    type: string;
    value: number;
    condition: number;

    constructor(type: string, value: number | undefined, condition: number) {
        if (value == null) {
            throw new Error('Value must be a number! It was undefined or null')
        }

        if (value <= 0) {
            throw new Error(`Value must be a positive number! It was ${value}`)
        }

        if (!['bid', 'ask'].includes(type)) {
            throw new Error(`Type must be bid|ask. It was ${type}`);
        }

        if (![0,1].includes(condition)) {
            throw new Error(`Condition must be 0|1. It was ${condition}`);
        }

        this.type = type;
        this.value = value;
        this.condition = condition;
    }

    setType(type: string) {
        if (!['bid', 'ask'].includes(type)) {
            throw new Error(`Type must be bid|ask. It was ${type}`);
        }

        this.type = type;
    }

    setValue(value: number) {
        if (value == null) {
            throw new Error('Value must be a number!')
        }

        if (value <= 0) {
            throw new Error('Value must be a positive number!')
        }
        
        this.value = value;
    }

    setCondition(condition: number) {
        if (![0,1].includes(condition)) {
            throw new Error(`Condition must be 0|1. It was ${condition}`);
        }

        this.condition = condition;
    }
}

type CreateNoteProps = {
    publish: (offer: Offer) => void;
}

const CreateOffer = (({ publish }: CreateNoteProps) => {
    const [type, setType] = useState('ask');
    const [value, setValue] = useState<number>(100);
    const [condition, setCondition] = useState<number>(0);

    return (
        <>
              <div className="trade">
                <div className='card'>
                    <h3>Create a New Offer</h3>

                    <label>
                        Condition: <select
                            value={condition}
                            onChange={e => setCondition(parseInt(e.target.value))}
                        >
                            <option value="0">Status Quo</option>
                            <option value="1">Project</option>
                        </select>
                    </label>

                    <hr />
                    <label>
                        Type: <select
                            value={type}
                            onChange={e => setType(e.target.value)}
                        >
                            <option value="bid">Bid</option>
                            <option value="ask">Ask</option>
                        </select>
                    </label>
                    <hr />
                    Value: <input
                        type="number" value={value}
                        onChange={e => setValue(parseFloat(e.target.value))}
                    />
                    <hr />
                    <button onClick={() => {
                        publish(new Offer(type, value, condition));
                    }}>Publish Your Offer</button>
                </div>
              </div>
        </>
    );
});

export { CreateOffer, Offer };