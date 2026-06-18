/**
 * Conversion Metadata Model
 * Stores conversion tracking information for auditing and confidence awareness
 * Used internally only - never exposed to UI
 */

import { ConfidenceLevel } from './average-weight-lookup-au';

/**
 * Tracks a count-to-weight conversion during ingredient aggregation
 */
export interface ConversionMetadata {
  ingredient: string; // Canonical ingredient name
  originalUnit: 'piece' | 'pieces' | 'clove' | 'can' | string; // COUNT unit used
  originalQuantity: number; // Quantity in original COUNT unit
  convertedUnit: 'g' | 'kg'; // Result unit
  convertedQuantity: number; // Quantity in result weight unit
  conversionSource: 'AVERAGE_WEIGHT_LOOKUP_AU'; // Where the conversion came from
  confidence: ConfidenceLevel; // Confidence level of the conversion
  description: string; // Human-readable description for logging
}

/**
 * Tracks conversions that were attempted but not applied
 */
export interface FailedConversionLog {
  ingredient: string;
  originalUnit: string;
  originalQuantity: number;
  reason: 'missing_lookup' | 'low_confidence' | 'other';
  loggedAt: Date;
}

/**
 * Storage for all conversions in a session/aggregation
 */
export class ConversionTracker {
  private conversions: ConversionMetadata[] = [];
  private failedAttempts: FailedConversionLog[] = [];

  /**
   * Record a successful conversion
   */
  logConversion(metadata: ConversionMetadata): void {
    this.conversions.push(metadata);
    console.log(
      `✓ Conversion [${metadata.confidence}]: ${metadata.ingredient} ` +
        `${metadata.originalQuantity} ${metadata.originalUnit} → ${metadata.convertedQuantity} ${metadata.convertedUnit}`
    );
  }

  /**
   * Log a conversion attempt that was skipped
   */
  logFailedAttempt(attempt: Omit<FailedConversionLog, 'loggedAt'>): void {
    this.failedAttempts.push({
      ...attempt,
      loggedAt: new Date(),
    });
    console.warn(
      `⚠️ Skipped conversion for ${attempt.ingredient}: ${attempt.reason} ` +
        `(${attempt.originalQuantity} ${attempt.originalUnit})`
    );
  }

  /**
   * Get all successful conversions
   */
  getConversions(): ConversionMetadata[] {
    return [...this.conversions];
  }

  /**
   * Get all failed conversion attempts
   */
  getFailedAttempts(): FailedConversionLog[] {
    return [...this.failedAttempts];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalConversions: number;
    byConfidence: Record<ConfidenceLevel, number>;
    failedAttempts: number;
  } {
    const byConfidence: Record<ConfidenceLevel, number> = {
      high: 0,
      medium: 0,
      low: 0,
      missing: 0,
    };

    this.conversions.forEach((c) => {
      byConfidence[c.confidence]++;
    });

    return {
      totalConversions: this.conversions.length,
      byConfidence,
      failedAttempts: this.failedAttempts.length,
    };
  }

  /**
   * Clear all tracked data
   */
  reset(): void {
    this.conversions = [];
    this.failedAttempts = [];
  }
}
