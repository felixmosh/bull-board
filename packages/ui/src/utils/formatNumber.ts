export const formatShortNumber = (number: number) => {
  if (number < 1000) {
    return number;
  }

  if (number >= 90000) {
    return '90K+';
  }

  const thousands = number / 1000;

  if (number < 10000) {
    // For 1000-9999, show single digit + K (e.g., "3K")
    return `${Math.floor(thousands)}K`;
  }

  // For 10000-89999, show two digits + decimal + K (e.g., "10.3K")
  // Remove decimal if it's .0
  const formatted = thousands.toFixed(1);
  return formatted.endsWith('.0') ? `${Math.floor(thousands)}K` : `${formatted}K`;
};
