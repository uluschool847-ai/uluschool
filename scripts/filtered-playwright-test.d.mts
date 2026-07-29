export type PlaywrightPartitionSelection = {
  options: string[];
  runAll: boolean;
  signedDeliverySpecs: string[];
  standardSpecs: string[];
  storageSpecs: string[];
};

export function partitionPlaywrightArgs(
  args: string[],
  projectDirectory?: string,
): PlaywrightPartitionSelection;
