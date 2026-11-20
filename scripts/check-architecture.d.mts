export interface Violation { rule: string; file: string; message: string }
export function checkArchitecture(root: string): Violation[];
