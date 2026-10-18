export const formatNumber = (value: number) => value.toFixed(3);

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
