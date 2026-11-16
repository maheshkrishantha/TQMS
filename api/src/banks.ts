export const sriLankaBanks = [
  { code: "7463", name: "Amana Bank PLC" },
  { code: "7010", name: "Bank of Ceylon" },
  { code: "7250", name: "Bank of China Limited" },
  { code: "7481", name: "Cargills Bank PLC" },
  { code: "7205", name: "Citibank, N.A." },
  { code: "7056", name: "Commercial Bank of Ceylon PLC" },
  { code: "7200", name: "Deutsche Bank AG, Colombo Branch" },
  { code: "7454", name: "DFCC Bank PLC" },
  { code: "7074", name: "Habib Bank Ltd" },
  { code: "7083", name: "Hatton National Bank PLC" },
  { code: "7108", name: "Indian Bank" },
  { code: "7117", name: "Indian Overseas Bank" },
  { code: "7269", name: "MCB Bank Ltd" },
  { code: "7214", name: "National Development Bank PLC" },
  { code: "7162", name: "Nations Trust Bank PLC" },
  { code: "7311", name: "Pan Asia Banking Corporation PLC" },
  { code: "7135", name: "People's Bank" },
  { code: "7472", name: "Public Bank Berhad" },
  { code: "7278", name: "Sampath Bank PLC" },
  { code: "7287", name: "Seylan Bank PLC" },
  { code: "7038", name: "Standard Chartered Bank" },
  { code: "7144", name: "State Bank of India" },
  { code: "7092", name: "The Hongkong and Shanghai Banking Corporation Ltd" },
  { code: "7601", name: "Union Bank of Colombo PLC" },
] as const;

export function isSriLankaBankCode(value: string): boolean {
  return sriLankaBanks.some((bank) => bank.code === value);
}
