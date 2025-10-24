import { PIIDetectionResult } from "../../types";
export declare class PIIFilter {
  private patterns;
  constructor();
  private initializePatterns;
  detect(text: string): PIIDetectionResult;
  sanitize(text: string): string;
  filter(text: string): string;
  isBlocked(text: string): boolean;
}
