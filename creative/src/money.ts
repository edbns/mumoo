/** An amount in the smallest unit of its currency (cents), as the person reads it. */
export const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
